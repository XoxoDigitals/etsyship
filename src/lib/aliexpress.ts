/**
 * Best-effort AliExpress product scraper.
 *
 * NOTE: AliExpress heavily blocks bots (captcha / punish pages / JS-only rendering), so a
 * FAILED or PARTIAL result is the COMMON path. Callers must always allow manual entry.
 * Parsing is regex-only over the returned HTML (no extra dependencies) and this function
 * NEVER throws.
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
  if (text.includes("£") || /\bGBP\b/.test(text)) return "GBP";
  if (text.includes("€") || /\bEUR\b/.test(text)) return "EUR";
  if (text.includes("$") || /\bUSD\b/.test(text)) return "USD";
  return undefined;
}

function parseNumber(raw: string): number | undefined {
  let s = raw.trim();
  // "12,34" (decimal comma) vs "1,234.56" (thousands comma)
  if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function extractPrice(html: string): { price?: number; currency?: Cur } {
  const text = unescapeJson(html);

  // Formatted price fragments, e.g. "formatedActivityPrice":"US $12.34"
  for (const key of ["formatedActivityPrice", "formatedPrice"]) {
    const m = new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`, "i").exec(text);
    if (m) {
      const num = /(\d[\d.,]*)/.exec(m[1]);
      const price = num ? parseNumber(num[1]) : undefined;
      if (price !== undefined) return { price, currency: currencyFromSymbol(m[1]) ?? "USD" };
    }
  }

  // "minActivityAmount":{"value":12.34,"currency":"USD"}
  const amt = /"(?:minActivityAmount|minAmount)"\s*:\s*\{[^{}]*?"value"\s*:\s*"?(\d+(?:\.\d+)?)"?[^{}]*?\}/i.exec(text);
  if (amt) {
    const price = parseNumber(amt[1]);
    const curM = /"currency"\s*:\s*"(USD|GBP|EUR)"/i.exec(amt[0]);
    if (price !== undefined) return { price, currency: (curM?.[1].toUpperCase() as Cur) ?? "USD" };
  }

  // Plain "US $12.34" / "£12.34" / "€12,34" in the page
  const plain = /(US\s?\$|\$|£|€)\s?(\d{1,6}(?:[.,]\d{1,2})?)/.exec(text);
  if (plain) {
    const price = parseNumber(plain[2]);
    if (price !== undefined) return { price, currency: currencyFromSymbol(plain[1]) ?? "USD" };
  }

  return {};
}

function extractImages(html: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (u: string | undefined) => {
    if (!u) return;
    let url = u.trim();
    if (url.startsWith("//")) url = "https:" + url;
    if (!/^https?:\/\//i.test(url)) return;
    if (seen.has(url)) return;
    seen.add(url);
    out.push(url);
  };

  push(metaContent(html, "og:image"));

  const text = unescapeJson(html);
  const re = /https?:\/\/ae\d*\.alicdn\.com\/[^"'\s\\)<>]+?\.(?:jpg|jpeg|png|webp)(?:_[^"'\s\\)<>]*)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null && out.length < 12) push(m[0]);

  return out.slice(0, 12);
}

function extractVariants(html: string): AliExpressResult["variants"] {
  const text = unescapeJson(html);
  const variants: AliExpressResult["variants"] = [];
  const seen = new Set<string>();

  // skuModule.productSKUPropertyList -> skuPropertyValues[] flat objects
  const re = /\{[^{}]*"propertyValueDisplayName"\s*:\s*"([^"]+)"[^{}]*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null && variants.length < 50) {
    const name = decodeEntities(m[1]);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const img = /"skuPropertyImagePath"\s*:\s*"([^"]+)"/.exec(m[0]);
    let imageUrl = img?.[1];
    if (imageUrl?.startsWith("//")) imageUrl = "https:" + imageUrl;
    variants.push({ name, ...(imageUrl && /^https?:\/\//i.test(imageUrl) ? { imageUrl } : {}) });
  }

  // priceModule / skuPriceList: attach prices if counts line up (best effort)
  if (variants.length > 0) {
    const prices: number[] = [];
    const pre = /"skuAmount"\s*:\s*\{[^{}]*?"value"\s*:\s*"?(\d+(?:\.\d+)?)"?/g;
    let pm: RegExpExecArray | null;
    while ((pm = pre.exec(text)) !== null) {
      const n = parseNumber(pm[1]);
      if (n !== undefined) prices.push(n);
    }
    if (prices.length === variants.length) variants.forEach((v, i) => (v.price = prices[i]));
  }

  return variants;
}

function isCur(c: string | undefined): c is Cur {
  return c === "USD" || c === "GBP" || c === "EUR";
}

// AliExpress embeds the product data as a big JSON blob. Pull it out by balanced-brace scan.
/* eslint-disable @typescript-eslint/no-explicit-any */
function extractRunParams(html: string): any | null {
  const markers = ["window.runParams = ", "window.runParams=", "window._init_data_ = ", "window._init_data_="];
  for (const marker of markers) {
    const mi = html.indexOf(marker);
    if (mi === -1) continue;
    const start = html.indexOf("{", mi);
    if (start === -1) continue;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < html.length; i++) {
      const ch = html[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(html.slice(start, i + 1));
          } catch {
            break; // try the next marker
          }
        }
      }
    }
  }
  return null;
}

function parsePriceFromData(data: any): { price?: number; currency?: Cur } {
  const pm = data?.priceModule ?? data?.priceComponent;
  if (!pm) return {};
  for (const key of ["formatedActivityPrice", "formatedPrice"]) {
    const v = pm[key];
    if (typeof v === "string") {
      const num = /(\d[\d.,]*)/.exec(v);
      const price = num ? parseNumber(num[1]) : undefined;
      if (price !== undefined) return { price, currency: currencyFromSymbol(v) ?? "USD" };
    }
  }
  const amt = pm.minActivityAmount ?? pm.minAmount ?? pm.maxActivityAmount;
  if (amt && amt.value !== undefined) {
    const price = parseNumber(String(amt.value));
    const currency = typeof amt.currency === "string" ? amt.currency.toUpperCase() : undefined;
    if (price !== undefined) return { price, currency: isCur(currency) ? currency : "USD" };
  }
  return {};
}

function parseVariantsFromData(data: any): AliExpressResult["variants"] {
  const list = data?.skuModule?.productSKUPropertyList;
  if (!Array.isArray(list)) return [];
  const out: AliExpressResult["variants"] = [];
  const seen = new Set<string>();
  for (const prop of list) {
    const values = prop?.skuPropertyValues;
    if (!Array.isArray(values)) continue;
    for (const v of values) {
      const name = typeof v?.propertyValueDisplayName === "string" ? decodeEntities(v.propertyValueDisplayName) : "";
      if (!name || seen.has(name)) continue;
      seen.add(name);
      let imageUrl = typeof v?.skuPropertyImagePath === "string" ? v.skuPropertyImagePath : undefined;
      if (imageUrl?.startsWith("//")) imageUrl = "https:" + imageUrl;
      out.push({ name, ...(imageUrl && /^https?:\/\//i.test(imageUrl) ? { imageUrl } : {}) });
      if (out.length >= 50) break;
    }
    if (out.length >= 50) break;
  }
  const priceList = data?.priceModule?.skuPriceList;
  if (Array.isArray(priceList) && priceList.length === out.length) {
    out.forEach((vv, i) => {
      const amt = priceList[i]?.skuVal?.skuActivityAmount?.value ?? priceList[i]?.skuVal?.skuAmount?.value;
      const n = amt !== undefined ? parseNumber(String(amt)) : undefined;
      if (n !== undefined) vv.price = n;
    });
  }
  return out;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// SSRF guard: only ever fetch https AliExpress hosts. IP literals, localhost, and any
// internal/metadata host fail this allowlist because they do not match the domain pattern,
// so there is no separate private-range check to maintain. Redirects are re-validated per hop.
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

function looksBlocked(html: string, status: number): boolean {
  if (status >= 400) return true;
  if (html.length < 500) return true;
  return /punish|x5secdata|captcha|unusual traffic|slide to verify|_____tmd_____/i.test(html) &&
    !/og:title/i.test(html);
}

export async function fetchAliExpress(url: string): Promise<AliExpressResult> {
  const start = allowedUrl(url);
  if (!start) return failed();
  let current: URL = start;
  try {
    const headers = {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
      "accept-language": "en-US,en",
    };
    // Follow redirects manually so each hop's destination is re-checked against the allowlist.
    let res: Response | null = null;
    for (let hop = 0; hop < 4; hop++) {
      res = await fetch(current.toString(), {
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(20000),
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        const next = loc ? allowedUrl(loc, current) : null;
        if (!next) return failed(); // redirect off the allowlist -> abort (SSRF guard)
        current = next;
        continue;
      }
      break;
    }
    if (!res) return failed();
    const html = await res.text();
    if (!html || looksBlocked(html, res.status)) return failed();

    let title = metaContent(html, "og:title");
    if (!title) {
      const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
      if (t?.[1]) title = decodeEntities(t[1]);
    }
    const description = metaContent(html, "og:description");
    const images = extractImages(html);

    // Prefer the embedded product JSON (variants + per-variant prices); fall back to regex scraping.
    const rp = extractRunParams(html);
    const rpData = rp ? rp.data ?? rp : null;
    const priceFromData = parsePriceFromData(rpData);
    const { price, currency } = priceFromData.price !== undefined ? priceFromData : extractPrice(html);
    const dataVariants = parseVariantsFromData(rpData);
    const variants = dataVariants.length ? dataVariants : extractVariants(html);

    const found = [Boolean(title), price !== undefined, images.length > 0];
    const count = found.filter(Boolean).length;
    const status: AliExpressResult["status"] = count === 3 ? "OK" : count > 0 ? "PARTIAL" : "FAILED";
    if (status === "FAILED") return failed();

    return {
      status,
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      images,
      ...(price !== undefined ? { price, currency: currency ?? "USD" } : {}),
      variants,
    };
  } catch {
    return failed();
  }
}
