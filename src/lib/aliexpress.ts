import zlib from "node:zlib";

/**
 * Multi-strategy AliExpress product parser & scraper.
 *
 * Supports:
 *   1. Direct item fetch on `www.aliexpress.com/item/{globalId}.html` using social-preview user-agents
 *      (`facebookexternalhit/1.1`, `WhatsApp/2.23.20.0`, `Twitterbot/1.0`) which bypass AliExpress's x5sec
 *      anti-bot challenge and return `window._d_c_.DCData` (`imagePathList` + `summImagePathList`).
 *      Automatically converts `www.aliexpress.us` item IDs (`32568...`) to global item IDs (`id - 2^51`).
 *   2. Automatic SSR Wholesale Search Enrichment (`/w/wholesale-{slug}.html` with `site=glo&c_tp=USD` cookie)
 *      to retrieve the full product title, exact USD sale price, gallery images, and gzipped SKU variants
 *      (`extraParams.sku_images`) when the item page is a CSR shell (`window._d_c_.isCSR = true`).
 *   3. Deep recursive JSON state search across `window._d_c_.DCData`, `window.runParams`, `window._init_data_`,
 *      `__NEXT_DATA__`, and `<script type="application/ld+json">`.
 *   4. Raw pasted HTML / JSON (`parseAliExpressInput`) as an optional manual fallback.
 *   5. Never throws.
 */

export type AliExpressResult = {
  status: "OK" | "PARTIAL" | "FAILED";
  title?: string;
  description?: string;
  images: string[];
  price?: number;
  currency?: "USD" | "GBP" | "EUR";
  variants: { name: string; price?: number; imageUrl?: string }[];
};

type Cur = "USD" | "GBP" | "EUR";

const FAILED: AliExpressResult = { status: "FAILED", images: [], variants: [] };

function failed(): AliExpressResult {
  return { ...FAILED, images: [], variants: [] };
}

// Standard AliExpress SKU propertyValueId -> human-readable variant name map
const AE_PROPERTY_VALUE_MAP: Record<string, string> = {
  "29": "White",
  "193": "Black",
  "10": "Red",
  "173": "Blue",
  "175": "Green",
  "366": "Yellow",
  "350850": "Pink",
  "496": "Purple",
  "350852": "Orange",
  "691": "Grey",
  "350853": "Brown",
  "100018786": "Silver",
  "350854": "Gold",
  "200004890": "Beige",
  "200004889": "Khaki",
  "100010420": "Clear",
  "771": "Multi",
  "1254": "Light Blue",
  "1052": "Dark Blue",
  "200002984": "Champagne",
  "200001951": "Rose Gold",
  "200003699": "Navy Blue",
  "100018787": "Dark Grey",
  "350851": "Light Grey",
  "100014064": "XL",
  "100014065": "XXL",
  "200000509": "S",
  "200000510": "M",
  "200000511": "L",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .trim();
}

function unescapeJson(s: string): string {
  return s
    .replace(/\\u002F/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/\\u003d/gi, "=")
    .replace(/\\"/g, '"');
}

function metaContent(html: string, key: string): string | undefined {
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const a = new RegExp(
    `<meta[^>]+(?:property|name)=["']${k}["'][^>]*?content=["']([^"']*)["']`,
    "i"
  ).exec(html);
  if (a?.[1]) return decodeEntities(a[1]);
  const b = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]*?(?:property|name)=["']${k}["']`,
    "i"
  ).exec(html);
  if (b?.[1]) return decodeEntities(b[1]);
  return undefined;
}

function currencyFromSymbol(text: string): Cur | undefined {
  if (text.includes("£") || /\bGBP\b/i.test(text)) return "GBP";
  if (text.includes("€") || /\bEUR\b/i.test(text)) return "EUR";
  if (text.includes("$") || /\bUSD\b/i.test(text)) return "USD";
  return undefined;
}

function isCur(c: string | undefined): c is Cur {
  return c === "USD" || c === "GBP" || c === "EUR";
}

function parseNumber(raw: string | number | undefined | null): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? raw : undefined;
  let s = String(raw).trim();
  if (!s) return undefined;
  const m = /(\d[\d.,]*)/.exec(s);
  if (!m) return undefined;
  s = m[1];
  if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function normalizeImageUrl(raw: string | undefined | null): string | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  let u = raw.trim();
  if (!u) return undefined;
  if (u.startsWith("//")) u = "https:" + u;
  if (!/^https?:\/\//i.test(u)) return undefined;
  // Strip tiny thumbnail suffixes like _50x50.jpg or _480x480q75.jpg_.avif to get clean full resolution
  u = u.replace(/_\d+x\d+[^/]*$/i, "");
  return u;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

function extractBalancedJson(str: string, marker: string): any | null {
  const mi = str.indexOf(marker);
  if (mi === -1) return null;
  const start = str.indexOf("{", mi + marker.length);
  if (start === -1 || start > mi + marker.length + 200) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < str.length && i - start < 2_500_000; i++) {
    const ch = str[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') {
      inStr = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(str.slice(start, i + 1));
        } catch {
          try {
            return JSON.parse(unescapeJson(str.slice(start, i + 1)));
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}

function extractEmbeddedJsonObjects(html: string): any[] {
  const results: any[] = [];

  const scriptRe =
    /<script[^>]*(?:type=["']application\/ld\+json["']|id=["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script>/gi;
  let sm: RegExpExecArray | null;
  while ((sm = scriptRe.exec(html)) !== null) {
    try {
      results.push(JSON.parse(sm[1].trim()));
    } catch {
      /* ignore */
    }
  }

  const markers = [
    "window._d_c_.DCData =",
    "window._d_c_.DCData=",
    "window.runParams =",
    "window.runParams=",
    "_dida_config_._init_data_ =",
    "_dida_config_._init_data_=",
    "data: {",
    '"skuModule":',
    '"priceComponent":',
    '"skuPaths":',
  ];

  for (const marker of markers) {
    let searchFrom = 0;
    while (searchFrom < html.length) {
      const mi = html.indexOf(marker, searchFrom);
      if (mi === -1) break;
      searchFrom = mi + marker.length;

      const start = marker.startsWith('"') ? html.lastIndexOf("{", mi) : html.indexOf("{", mi);
      if (start === -1 || start < mi - 200) continue;

      let depth = 0;
      let inStr = false;
      let esc = false;
      for (let i = start; i < html.length && i - start < 2_500_000; i++) {
        const ch = html[i];
        if (inStr) {
          if (esc) esc = false;
          else if (ch === "\\") esc = true;
          else if (ch === '"') inStr = false;
        } else if (ch === '"') {
          inStr = true;
        } else if (ch === "{") {
          depth++;
        } else if (ch === "}") {
          depth--;
          if (depth === 0) {
            const candidate = html.slice(start, i + 1);
            try {
              results.push(JSON.parse(candidate));
            } catch {
              try {
                results.push(JSON.parse(unescapeJson(candidate)));
              } catch {
                /* ignore */
              }
            }
            break;
          }
        }
      }
    }
  }

  return results;
}

function findNodes(root: any, predicate: (obj: any) => boolean, maxDepth = 9): any[] {
  const found: any[] = [];
  const visited = new Set<any>();

  function walk(node: any, depth: number) {
    if (!node || typeof node !== "object" || depth > maxDepth || visited.has(node)) return;
    visited.add(node);
    if (predicate(node)) found.push(node);
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
    } else {
      for (const k of Object.keys(node)) walk(node[k], depth + 1);
    }
  }

  walk(root, 0);
  return found;
}

function extractPriceFromJsonTrees(trees: any[]): { price?: number; currency?: Cur } {
  for (const root of trees) {
    const offers = root?.offers;
    if (offers) {
      const offer = Array.isArray(offers) ? offers[0] : offers;
      const p = parseNumber(offer?.price ?? offer?.lowPrice);
      const cur = typeof offer?.priceCurrency === "string" ? offer.priceCurrency.toUpperCase() : undefined;
      if (p !== undefined) return { price: p, currency: isCur(cur) ? cur : "USD" };
    }

    const nodes = findNodes(
      root,
      (o) =>
        o.formatedActivityPrice !== undefined ||
        o.formatedPrice !== undefined ||
        o.minActivityAmount !== undefined ||
        o.minAmount !== undefined ||
        o.discountPrice !== undefined ||
        o.skuIdStrPriceInfoMap !== undefined ||
        o.targetSalePrice !== undefined
    );

    for (const pm of nodes) {
      if (pm.skuIdStrPriceInfoMap && typeof pm.skuIdStrPriceInfoMap === "object") {
        const vals = Object.values(pm.skuIdStrPriceInfoMap) as any[];
        const prices: { p: number; cur?: Cur }[] = [];
        for (const entry of vals) {
          const sp = entry?.skuPrice ?? entry?.salePrice ?? entry;
          const rawForma = sp?.forma ?? sp?.formatedAmount ?? sp?.formatedPrice;
          const p =
            parseNumber(rawForma) ??
            (typeof sp?.val === "number" ? (sp.val > 1000 ? sp.val / 100 : sp.val) : parseNumber(sp?.value));
          const curStr = (sp?.currency || currencyFromSymbol(String(rawForma || "")) || "USD").toUpperCase();
          if (p !== undefined) prices.push({ p, cur: isCur(curStr) ? curStr : "USD" });
        }
        if (prices.length > 0) {
          prices.sort((a, b) => a.p - b.p);
          return { price: prices[0].p, currency: prices[0].cur ?? "USD" };
        }
      }

      for (const key of ["formatedActivityPrice", "formatedPrice", "targetSalePrice", "origPrice"]) {
        if (typeof pm[key] === "string") {
          const price = parseNumber(pm[key]);
          if (price !== undefined) return { price, currency: currencyFromSymbol(pm[key]) ?? "USD" };
        }
      }

      const amt = pm.minActivityAmount ?? pm.minAmount ?? pm.discountPrice?.minActivityAmount ?? pm.maxActivityAmount;
      if (amt && amt.value !== undefined) {
        const price = parseNumber(amt.value);
        const cur = typeof amt.currency === "string" ? amt.currency.toUpperCase() : undefined;
        if (price !== undefined) return { price, currency: isCur(cur) ? cur : "USD" };
      }
    }
  }
  return {};
}

function extractVariantsFromJsonTrees(trees: any[]): AliExpressResult["variants"] {
  for (const root of trees) {
    const propContainers = findNodes(
      root,
      (o) => Array.isArray(o.productSKUPropertyList) || Array.isArray(o.skuPropertyList)
    );
    if (propContainers.length === 0) continue;

    const propList: any[] =
      propContainers[0].productSKUPropertyList ?? propContainers[0].skuPropertyList ?? [];
    if (!Array.isArray(propList) || propList.length === 0) continue;

    let priceInfoMap: Record<string, any> = {};
    let skuPaths: any[] = [];
    let skuPriceList: any[] = [];

    for (const node of findNodes(
      root,
      (o) => o.skuIdStrPriceInfoMap !== undefined || Array.isArray(o.skuPaths) || Array.isArray(o.skuPriceList)
    )) {
      if (node.skuIdStrPriceInfoMap && typeof node.skuIdStrPriceInfoMap === "object") {
        priceInfoMap = { ...priceInfoMap, ...node.skuIdStrPriceInfoMap };
      }
      if (Array.isArray(node.skuPaths) && node.skuPaths.length > skuPaths.length) {
        skuPaths = node.skuPaths;
      }
      if (Array.isArray(node.skuPriceList) && node.skuPriceList.length > skuPriceList.length) {
        skuPriceList = node.skuPriceList;
      }
    }

    const priceForSkuId = (skuId: string | undefined): number | undefined => {
      if (!skuId) return undefined;
      const info = priceInfoMap[skuId];
      if (!info) return undefined;
      const sp = info?.skuPrice ?? info?.salePrice ?? info;
      const forma = sp?.forma ?? sp?.formatedAmount ?? sp?.formatedPrice;
      return (
        parseNumber(forma) ??
        (typeof sp?.val === "number" ? (sp.val > 1000 ? sp.val / 100 : sp.val) : parseNumber(sp?.value))
      );
    };

    const priceFromSkuVal = (skuVal: any): number | undefined => {
      if (!skuVal) return undefined;
      return (
        parseNumber(skuVal?.skuActivityAmount?.value) ??
        parseNumber(skuVal?.skuAmount?.value) ??
        parseNumber(skuVal?.actSkuCalPrice) ??
        parseNumber(skuVal?.skuCalPrice) ??
        parseNumber(skuVal?.formatedActivityPrice) ??
        parseNumber(skuVal?.formatedPrice)
      );
    };

    const filteredProps =
      propList.length > 1
        ? propList.filter((p) => !/ships?\s*from/i.test(String(p?.skuPropertyName || "")))
        : propList;
    const activeProps = filteredProps.length > 0 ? filteredProps : propList;

    const valueMap = new Map<string, { name: string; imageUrl?: string; propId: string }>();
    for (const prop of activeProps) {
      const propId = String(prop?.skuPropertyId ?? "");
      const values = Array.isArray(prop?.skuPropertyValues) ? prop.skuPropertyValues : [];
      for (const v of values) {
        const valId = String(v?.propertyValueId ?? v?.propertyValueIdLong ?? "");
        const name = decodeEntities(
          String(v?.propertyValueDisplayName || v?.propertyValueName || v?.skuPropertyValueTips || "")
        );
        if (!name) continue;
        const imageUrl = normalizeImageUrl(v?.skuPropertyImagePath || v?.skuPropertyImageSummPath);
        if (valId) {
          valueMap.set(`${propId}:${valId}`, { name, imageUrl, propId });
          valueMap.set(valId, { name, imageUrl, propId });
        }
      }
    }

    const out: AliExpressResult["variants"] = [];
    const seenNames = new Set<string>();

    if (skuPriceList.length > 0 && valueMap.size > 0) {
      for (const item of skuPriceList) {
        if (item?.salable === false || item?.skuVal?.availQuantity === 0) continue;
        const propIdsRaw = String(item?.skuPropIds || "");
        const attrRaw = String(item?.skuAttr || "");
        const parts: string[] = [];
        let img: string | undefined;

        if (attrRaw) {
          for (const seg of attrRaw.split(";")) {
            const [pair, hashLabel] = seg.split("#");
            const hit = valueMap.get(pair);
            if (hit) {
              parts.push(hit.name);
              if (!img && hit.imageUrl) img = hit.imageUrl;
            } else if (hashLabel) {
              parts.push(decodeEntities(hashLabel));
            }
          }
        }
        if (parts.length === 0 && propIdsRaw) {
          for (const vid of propIdsRaw.split(",")) {
            const hit = valueMap.get(vid.trim());
            if (hit) {
              parts.push(hit.name);
              if (!img && hit.imageUrl) img = hit.imageUrl;
            }
          }
        }

        const comboName = parts.join(" / ").trim();
        if (!comboName || seenNames.has(comboName)) continue;
        seenNames.add(comboName);

        const skuId = String(item?.skuIdStr ?? item?.skuId ?? "");
        const price = priceFromSkuVal(item?.skuVal) ?? priceForSkuId(skuId);
        out.push({
          name: comboName,
          ...(price !== undefined ? { price } : {}),
          ...(img ? { imageUrl: img } : {}),
        });
        if (out.length >= 60) break;
      }
    }

    if (out.length === 0 && skuPaths.length > 0 && valueMap.size > 0) {
      for (const pathObj of skuPaths) {
        if (pathObj?.salable === false || pathObj?.skuStock === 0) continue;
        const pathStr = String(pathObj?.path || pathObj?.skuPropIds || "");
        const parts: string[] = [];
        let img: string | undefined;

        for (const seg of pathStr.split(/[;,]/)) {
          const hit = valueMap.get(seg.trim());
          if (hit) {
            parts.push(hit.name);
            if (!img && hit.imageUrl) img = hit.imageUrl;
          }
        }

        const comboName = parts.join(" / ").trim();
        if (!comboName || seenNames.has(comboName)) continue;
        seenNames.add(comboName);

        const skuId = String(pathObj?.skuIdStr ?? pathObj?.skuId ?? "");
        const price = priceForSkuId(skuId) ?? priceFromSkuVal(pathObj?.skuVal);
        out.push({
          name: comboName,
          ...(price !== undefined ? { price } : {}),
          ...(img ? { imageUrl: img } : {}),
        });
        if (out.length >= 60) break;
      }
    }

    if (out.length === 0) {
      for (const prop of activeProps) {
        const values = Array.isArray(prop?.skuPropertyValues) ? prop.skuPropertyValues : [];
        for (const v of values) {
          const name = decodeEntities(
            String(v?.propertyValueDisplayName || v?.propertyValueName || v?.skuPropertyValueTips || "")
          );
          if (!name || seenNames.has(name)) continue;
          seenNames.add(name);
          const imageUrl = normalizeImageUrl(v?.skuPropertyImagePath || v?.skuPropertyImageSummPath);
          out.push({ name, ...(imageUrl ? { imageUrl } : {}) });
          if (out.length >= 60) break;
        }
        if (out.length >= 60) break;
      }
    }

    if (out.length > 0) return out;
  }

  return [];
}

function extractTitleFromJsonTrees(trees: any[]): string | undefined {
  for (const root of trees) {
    if (
      typeof root?.name === "string" &&
      root.name.trim() &&
      root.name !== "ItemDetailResp" &&
      root["@type"] === "Product"
    ) {
      return decodeEntities(root.name);
    }
    const nodes = findNodes(
      root,
      (o) =>
        typeof o.subject === "string" ||
        (o.titleModule && typeof o.titleModule.subject === "string") ||
        Array.isArray(o.summImagePathList)
    );
    for (const n of nodes) {
      const s = n.subject ?? n.titleModule?.subject;
      if (typeof s === "string" && s.trim()) return decodeEntities(s);
    }
    // Extract slug from DCData.summImagePathList[0] if subject is not present
    for (const n of nodes) {
      if (Array.isArray(n.summImagePathList) && typeof n.summImagePathList[0] === "string") {
        const m = /\/kf\/[^/]+\/([^/.]+)\./.exec(n.summImagePathList[0]);
        if (m?.[1] && m[1].includes("-")) {
          return m[1].replace(/-/g, " ").trim();
        }
      }
    }
  }
  return undefined;
}

function extractSlugFromTrees(trees: any[]): string | undefined {
  for (const root of trees) {
    const nodes = findNodes(root, (o) => Array.isArray(o.summImagePathList));
    for (const n of nodes) {
      if (Array.isArray(n.summImagePathList) && typeof n.summImagePathList[0] === "string") {
        const m = /\/kf\/[^/]+\/([^/.]+)\./.exec(n.summImagePathList[0]);
        if (m?.[1] && m[1].includes("-")) return m[1];
      }
    }
  }
  return undefined;
}

function imageHashKey(url: string): string {
  const m = /\/kf\/([A-Za-z0-9]+)/.exec(url);
  return m?.[1] ?? url;
}

function extractImagesFromJsonTrees(trees: any[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: unknown) => {
    const u = typeof raw === "string" ? normalizeImageUrl(raw) : undefined;
    if (!u) return;
    const key = imageHashKey(u);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(u);
    }
  };

  for (const root of trees) {
    if (Array.isArray(root?.image)) root.image.forEach(push);
    else if (typeof root?.image === "string") push(root.image);

    const nodes = findNodes(root, (o) => Array.isArray(o.imagePathList) || Array.isArray(o.images));
    for (const n of nodes) {
      if (Array.isArray(n.imagePathList)) n.imagePathList.forEach(push);
      if (Array.isArray(n.images)) {
        n.images.forEach((img: any) => push(typeof img === "string" ? img : img?.imgUrl));
      }
    }
  }
  return out.slice(0, 12);
}

/**
 * Decode gzipped base64 `extraParams.sku_images` from AliExpress wholesale search cards.
 * Format: `14:175:S912669ad65e940749a444de30b1d93c3f.jpg;193:S48741a19b30641f58594fd09c840e6897.jpg`
 */
function decodeGzipSkuImages(b64: string | undefined, basePrice?: number): AliExpressResult["variants"] {
  if (!b64 || typeof b64 !== "string") return [];
  try {
    const raw = zlib.gunzipSync(Buffer.from(b64, "base64")).toString("utf8");
    const entries = raw.split(";").filter(Boolean);
    const out: AliExpressResult["variants"] = [];
    const seen = new Set<string>();

    entries.forEach((entry, idx) => {
      const parts = entry.split(":");
      const file = parts[parts.length - 1];
      const valId = parts.length >= 3 ? parts[1] : parts[0];
      if (!file || !/\.(?:jpg|jpeg|png|webp)$/i.test(file)) return;

      let name = AE_PROPERTY_VALUE_MAP[valId] || `Option ${idx + 1}`;
      if (seen.has(name)) name = `${name} (${idx + 1})`;
      seen.add(name);

      const imageUrl = `https://ae-pic-a1.aliexpress-media.com/kf/${file}`;
      out.push({
        name,
        ...(basePrice !== undefined ? { price: basePrice } : {}),
        imageUrl,
      });
    });

    return out;
  } catch {
    return [];
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */

function extractPriceRegex(html: string): { price?: number; currency?: Cur } {
  const text = unescapeJson(html);

  const keys = [
    "formatedActivityPrice",
    "formatedPrice",
    "targetSalePrice",
    "actSkuCalPrice",
    "skuCalPrice",
    "formattedPrice",
    "formatted_price",
    "salePrice",
    "lowPrice",
  ];
  for (const key of keys) {
    const m = new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`, "i").exec(text);
    if (m) {
      const price = parseNumber(m[1]);
      if (price !== undefined) return { price, currency: currencyFromSymbol(m[1]) ?? "USD" };
    }
  }

  const amt =
    /"(?:minActivityAmount|minAmount|skuActivityAmount|skuAmount)"\s*:\s*\{[^{}]*?"value"\s*:\s*"?(\d+(?:\.\d+)?)"?[^{}]*?\}/i.exec(
      text
    );
  if (amt) {
    const price = parseNumber(amt[1]);
    const curM = /"currency"\s*:\s*"(USD|GBP|EUR)"/i.exec(amt[0]);
    if (price !== undefined) return { price, currency: (curM?.[1].toUpperCase() as Cur) ?? "USD" };
  }

  return {};
}

function extractImagesRegex(html: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (u: string | undefined) => {
    const norm = normalizeImageUrl(u);
    if (!norm) return;
    // Ignore tiny AliExpress UI icons
    if (/\/(?:208x824|110x42|64x64|154x64)\./i.test(norm)) return;
    const key = imageHashKey(norm);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(norm);
  };

  push(metaContent(html, "og:image"));
  push(metaContent(html, "twitter:image"));

  const text = unescapeJson(html);
  const re =
    /https?:\/\/(?:ae\d*\.alicdn\.com|ae-pic-[a-z0-9-]+\.aliexpress-media\.com)\/kf\/[^"'\s\\)<>]+?\.(?:jpg|jpeg|png|webp)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null && out.length < 12) push(m[0]);

  return out.slice(0, 12);
}

function extractVariantsRegex(html: string): AliExpressResult["variants"] {
  const text = unescapeJson(html);
  const variants: AliExpressResult["variants"] = [];
  const seen = new Set<string>();

  const re = /\{[^{}]*"(?:propertyValueDisplayName|propertyValueName)"\s*:\s*"([^"]+)"[^{}]*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null && variants.length < 50) {
    const name = decodeEntities(m[1]);
    if (!name || seen.has(name) || /^(china|united states|spain|france|uk)$/i.test(name)) continue;
    seen.add(name);
    const img = /"skuPropertyImage(?:Path|SummPath)"\s*:\s*"([^"]+)"/.exec(m[0]);
    const imageUrl = normalizeImageUrl(img?.[1]);
    variants.push({ name, ...(imageUrl ? { imageUrl } : {}) });
  }

  if (variants.length > 0) {
    const prices: number[] = [];
    const pre =
      /"(?:skuActivityAmount|skuAmount|skuPrice)"\s*:\s*\{[^{}]*?"(?:value|val|forma)"\s*:\s*"?(\$?\d+(?:\.\d+)?)"?/g;
    let pm: RegExpExecArray | null;
    while ((pm = pre.exec(text)) !== null) {
      let n = parseNumber(pm[1]);
      if (n !== undefined && !pm[1].includes(".") && n > 500) n = n / 100;
      if (n !== undefined) prices.push(n);
    }
    if (prices.length >= variants.length) {
      variants.forEach((v, i) => {
        v.price = prices[i];
      });
    }
  }

  return variants;
}

export function parseAliExpressInput(rawInput: string): AliExpressResult {
  const html = rawInput.trim();
  if (!html) return failed();

  const trees = extractEmbeddedJsonObjects(html);

  if (html.startsWith("{") || html.startsWith("[")) {
    try {
      trees.unshift(JSON.parse(html));
    } catch {
      /* ignore */
    }
  }

  let title =
    extractTitleFromJsonTrees(trees) ||
    metaContent(html, "og:title") ||
    metaContent(html, "twitter:title");
  if (!title) {
    const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    if (t?.[1]) title = decodeEntities(t[1]);
  }
  if (title) {
    title = title
      .replace(/\s*[-|–]\s*AliExpress.*$/i, "")
      .replace(/^Buy\s+/i, "")
      .trim();
  }

  const description = metaContent(html, "og:description") || metaContent(html, "description");

  const treeImages = extractImagesFromJsonTrees(trees);
  const regexImages = extractImagesRegex(html);
  const seenImgKeys = new Set<string>();
  const images: string[] = [];
  for (const img of [...treeImages, ...regexImages]) {
    const k = imageHashKey(img);
    if (!seenImgKeys.has(k)) {
      seenImgKeys.add(k);
      images.push(img);
    }
    if (images.length >= 12) break;
  }

  const treePrice = extractPriceFromJsonTrees(trees);
  const regexPrice = extractPriceRegex(html);
  const price = treePrice.price ?? regexPrice.price;
  const currency = treePrice.currency ?? regexPrice.currency ?? "USD";

  const treeVariants = extractVariantsFromJsonTrees(trees);
  const variants = treeVariants.length > 0 ? treeVariants : extractVariantsRegex(html);

  const effectivePrice =
    price ??
    variants.reduce<number | undefined>((min, v) => {
      if (v.price === undefined) return min;
      return min === undefined || v.price < min ? v.price : min;
    }, undefined);

  const foundFlags = [Boolean(title), effectivePrice !== undefined, images.length > 0 || variants.length > 0];
  const count = foundFlags.filter(Boolean).length;
  const status: AliExpressResult["status"] =
    Boolean(title) && effectivePrice !== undefined && (images.length > 0 || variants.length > 0)
      ? "OK"
      : count > 0
        ? "PARTIAL"
        : "FAILED";

  if (status === "FAILED") return failed();

  return {
    status,
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    images,
    ...(effectivePrice !== undefined ? { price: effectivePrice, currency } : {}),
    variants,
  };
}

// SSRF guard: only ever fetch https AliExpress hosts.
const ALIEXPRESS_HOST = /(?:^|\.)aliexpress\.[a-z][a-z.]*$/i;

function allowedUrl(raw: string, base?: URL): URL | null {
  let u: URL;
  try {
    u = base ? new URL(raw, base) : new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  if (!ALIEXPRESS_HOST.test(u.hostname.toLowerCase())) return null;
  return u;
}

function extractItemIds(url: string): { rawId: string; globalId: string } | null {
  const m = /\/item\/(\d+)\.html/i.exec(url) || /\/i\/(\d+)\.html/i.exec(url) || /itemId=(\d+)/i.exec(url);
  if (!m?.[1]) return null;
  const rawId = m[1];
  try {
    const big = BigInt(rawId);
    const shift = BigInt("2251799813685248"); // 1n << 51n (US -> Global item ID offset)
    const globalId = rawId.startsWith("32568") && big > shift ? String(big - shift) : rawId;
    return { rawId, globalId };
  } catch {
    return { rawId, globalId: rawId };
  }
}

async function fetchHtmlFollowingRedirects(start: URL, headers: Record<string, string>): Promise<string | null> {
  let current: URL = start;
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(current.toString(), {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      const next = loc ? allowedUrl(loc, current) : null;
      if (!next) return null;
      current = next;
      continue;
    }
    if (res.status >= 400) return null;
    return await res.text();
  }
  return null;
}

/**
 * Enrich CSR item page data by querying AliExpress's SSR wholesale search page (`/w/wholesale-{slug}.html`),
 * which embeds `_dida_config_._init_data_` with full title, USD sale price, gallery images, and gzipped SKU variants.
 */
async function enrichFromWholesaleSearch(
  slug: string,
  ids: { rawId: string; globalId: string },
  existingImages: string[]
): Promise<Partial<AliExpressResult>> {
  try {
    const searchSlug = slug
      .replace(/[^a-zA-Z0-9-]+/g, "-")
      .split("-")
      .filter(Boolean)
      .slice(0, 8)
      .join("-");
    if (!searchSlug) return {};

    const wUrl = allowedUrl(`https://www.aliexpress.com/w/wholesale-${encodeURIComponent(searchSlug)}.html`);
    if (!wUrl) return {};

    const html = await fetchHtmlFollowingRedirects(wUrl, {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      "accept-language": "en-US,en;q=0.9",
      cookie: "aep_usuc_f=site=glo&c_tp=USD&b_locale=en_US; intl_locale=en_US;",
    });
    if (!html) return {};

    const listIdx = html.indexOf('"itemList":{"content":[');
    if (listIdx === -1) return {};

    const arrStart = html.indexOf("[", listIdx);
    if (arrStart === -1) return {};

    let depth = 0;
    let inStr = false;
    let esc = false;
    let arrEnd = arrStart;
    for (let i = arrStart; i < html.length; i++) {
      const ch = html[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') {
        inStr = true;
      } else if (ch === "[") {
        depth++;
      } else if (ch === "]") {
        depth--;
        if (depth === 0) {
          arrEnd = i + 1;
          break;
        }
      }
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const items: any[] = JSON.parse(html.slice(arrStart, arrEnd));
    if (!Array.isArray(items) || items.length === 0) return {};

    const firstImgHash = existingImages[0] ? /\/kf\/([^/.]+)/.exec(existingImages[0])?.[1] : null;
    const match =
      items.find((it) => {
        const pid = String(it?.productId || "");
        const rid = String(it?.redirectedId || "");
        const xid = String(it?.trace?.utLogMap?.x_object_id || "");
        const extF = String(it?.trace?.pdpParams?.pdp_ext_f || "");
        if (
          pid === ids.globalId ||
          pid === ids.rawId ||
          rid === ids.globalId ||
          rid === ids.rawId ||
          xid === ids.globalId ||
          xid === ids.rawId ||
          extF.includes(ids.globalId) ||
          extF.includes(ids.rawId)
        ) {
          return true;
        }
        if (firstImgHash && JSON.stringify(it?.images || []).includes(firstImgHash)) {
          return true;
        }
        return false;
      }) || items[0];

    if (!match) return {};

    const title =
      typeof match?.title?.displayTitle === "string" && match.title.displayTitle.trim()
        ? decodeEntities(match.title.displayTitle.trim())
        : undefined;

    const salePriceObj = match?.prices?.salePrice;
    const price =
      parseNumber(salePriceObj?.minPrice) ??
      parseNumber(salePriceObj?.formattedPrice) ??
      parseNumber(match?.trace?.utLogMap?.formatted_price);
    const rawCur = String(salePriceObj?.currencyCode || "USD").toUpperCase();
    const currency: Cur = isCur(rawCur) ? rawCur : "USD";

    const images: string[] = [];
    if (Array.isArray(match?.images)) {
      for (const img of match.images) {
        const u = normalizeImageUrl(img?.imgUrl);
        if (u && !images.includes(u)) images.push(u);
      }
    }

    const variants = decodeGzipSkuImages(match?.extraParams?.sku_images, price);
    /* eslint-enable @typescript-eslint/no-explicit-any */

    return {
      ...(title ? { title } : {}),
      ...(price !== undefined ? { price, currency } : {}),
      ...(images.length > 0 ? { images } : {}),
      ...(variants.length > 0 ? { variants } : {}),
    };
  } catch {
    return {};
  }
}

export async function fetchAliExpress(url: string, rawHtmlOverride?: string): Promise<AliExpressResult> {
  if (rawHtmlOverride && rawHtmlOverride.trim().length > 0) {
    return parseAliExpressInput(rawHtmlOverride);
  }

  const start = allowedUrl(url);
  if (!start) return failed();

  const ids = extractItemIds(start.toString());
  const targetUrl = ids
    ? allowedUrl(`https://www.aliexpress.com/item/${ids.globalId}.html`) ?? start
    : start;

  // Social crawler UAs bypass AliExpress's x5sec captcha and return DCData (`imagePathList` + `summImagePathList`)
  const uas = [
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "WhatsApp/2.23.20.0",
    "Twitterbot/1.0",
  ];

  let html: string | null = null;
  for (const ua of uas) {
    try {
      const fetched = await fetchHtmlFollowingRedirects(targetUrl, {
        "user-agent": ua,
        "accept-language": "en-US,en;q=0.9",
      });
      if (fetched && fetched.length > 5000 && !fetched.includes("_____tmd_____/punish")) {
        html = fetched;
        break;
      }
    } catch {
      /* try next UA */
    }
  }

  let baseResult = html ? parseAliExpressInput(html) : failed();

  // If the item page was a CSR shell (missing price or variants), enrich via SSR wholesale search!
  if (ids && (baseResult.price === undefined || baseResult.variants.length === 0)) {
    const dc = html ? extractBalancedJson(html, "window._d_c_.DCData") : null;
    const trees = dc ? [dc] : [];
    const slug = extractSlugFromTrees(trees) || baseResult.title || "";
    if (slug) {
      const enriched = await enrichFromWholesaleSearch(slug, ids, baseResult.images);
      const title = enriched.title || baseResult.title;
      const price = baseResult.price ?? enriched.price;
      const currency = baseResult.currency ?? enriched.currency ?? "USD";
      const images = Array.from(new Set([...baseResult.images, ...(enriched.images ?? [])])).slice(0, 12);
      const variants = baseResult.variants.length > 0 ? baseResult.variants : (enriched.variants ?? []);

      const hasAll = Boolean(title) && price !== undefined && (images.length > 0 || variants.length > 0);
      const hasAny = Boolean(title) || price !== undefined || images.length > 0 || variants.length > 0;

      baseResult = {
        status: hasAll ? "OK" : hasAny ? "PARTIAL" : "FAILED",
        ...(title ? { title } : {}),
        ...(baseResult.description ? { description: baseResult.description } : {}),
        images,
        ...(price !== undefined ? { price, currency } : {}),
        variants,
      };
    }
  }

  return baseResult;
}
