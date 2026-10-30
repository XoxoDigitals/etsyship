import crypto from "node:crypto";
import type { ShipmentStatus } from "@prisma/client";
import type { NormalizedEvent, NormalizedResult, TrackingProvider } from "./types";
import { cainiaoProvider } from "./cainiao";

/**
 * Customer-facing carriers: FedEx, USPS, UPS (and any other carrier).
 *
 * Includes:
 *   1. Built-in KEYLESS universal carrier tracking via Pkge (`pkge.net` AES-256-CBC payload + live update poll),
 *      which tracks UPS, FedEx, USPS, DHL, Royal Mail, and 800+ carriers without any API key or Akamai block.
 *   2. Direct USPS (`tools.usps.com`) and Cainiao Global (`global.cainiao.com`) keyless fallbacks.
 *   3. Optional aggregator overrides (AfterShip or TrackingMore) if configured in Settings.
 */

export type CarrierCode = "fedex" | "usps" | "ups" | "dhl" | "cainiao" | "other";
export type CarrierSlug = CarrierCode;

export interface TrackingConfig {
  provider?: string;
  apiKey?: string;
}

export const CARRIER_NAMES: Record<CarrierCode, string> = {
  fedex: "FedEx",
  usps: "USPS",
  ups: "UPS",
  dhl: "DHL",
  cainiao: "Cainiao",
  other: "Carrier",
};

const PKGE_COURIER_IDS: Partial<Record<CarrierCode, number>> = {
  usps: 1,
  fedex: 9,
  dhl: 10,
  cainiao: 14,
  ups: 17,
};

export function detectCarrier(trackingNumber: string, hint?: string | null): CarrierCode {
  const h = hint?.toLowerCase().trim();
  if (h === "usps" || h === "ups" || h === "fedex" || h === "dhl" || h === "cainiao") return h;
  const tn = trackingNumber.replace(/\s+/g, "").toUpperCase();
  if (/^1Z[0-9A-Z]{16}$/.test(tn) || /^T\d{10}$/.test(tn) || /^\d{9}$/.test(tn)) return "ups";
  if (
    /^(94|93|92|95|91)\d{18,24}$/.test(tn) ||
    /^[A-Z]{2}\d{9}US$/.test(tn) ||
    /^420\d{23,31}$/.test(tn) ||
    /^82\d{8}$/.test(tn)
  ) {
    return "usps";
  }
  if (/^\d{12}$/.test(tn) || /^\d{15}$/.test(tn) || /^\d{20}$/.test(tn) || /^\d{22}$/.test(tn)) {
    return "fedex";
  }
  if (/^(LP|CN|CAINIAO|1MCAIN)/i.test(tn)) {
    return "cainiao";
  }
  if (/^\d{10}$/.test(tn) || /^JJD\d{10,20}$/.test(tn) || /^GM\d{16,20}$/.test(tn)) {
    return "dhl";
  }
  return "other";
}

export function carrierDisplayName(slug: CarrierCode): string {
  return CARRIER_NAMES[slug] ?? "Carrier";
}

export function carrierDeepLink(trackingNumber: string, slug?: CarrierCode | string | null): string {
  const q = encodeURIComponent(trackingNumber.trim());
  const c = (slug && slug in CARRIER_NAMES ? (slug as CarrierCode) : detectCarrier(trackingNumber));
  switch (c) {
    case "usps":
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${q}`;
    case "ups":
      return `https://www.ups.com/track?loc=en_US&tracknum=${q}`;
    case "fedex":
      return `https://www.fedex.com/fedextrack/?trknbr=${q}`;
    case "dhl":
      return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${q}`;
    case "cainiao":
      return `https://global.cainiao.com/newDetail.htm?mailNoList=${q}`;
    default:
      return `https://www.google.com/search?q=${q}`;
  }
}

function mapStatusText(raw: string | undefined | null): ShipmentStatus {
  const s = (raw || "").toLowerCase();
  if (!s) return "PENDING";
  if (
    s.includes("deliver") &&
    !s.includes("out for") &&
    !s.includes("attempt") &&
    !s.includes("expect") &&
    !s.includes("schedul")
  ) {
    return "DELIVERED";
  }
  if (s.includes("out for delivery") || s.includes("out_for_delivery")) return "OUT_FOR_DELIVERY";
  if (
    s.includes("exception") ||
    s.includes("alert") ||
    s.includes("return") ||
    s.includes("hold") ||
    s.includes("undeliverable") ||
    s.includes("delay") ||
    s.includes("fail")
  ) {
    return "EXCEPTION";
  }
  if (
    s.includes("in transit") ||
    s.includes("in_transit") ||
    s.includes("on the way") ||
    s.includes("departed") ||
    s.includes("arrived") ||
    s.includes("processed") ||
    s.includes("processing") ||
    s.includes("origin scan") ||
    s.includes("picked up") ||
    s.includes("customs") ||
    s.includes("facility") ||
    s.includes("post office") ||
    s.includes("on its way") ||
    s.includes("left fedex")
  ) {
    return "IN_TRANSIT";
  }
  if (
    s.includes("label created") ||
    s.includes("info received") ||
    s.includes("information sent") ||
    s.includes("pre-shipment") ||
    s.includes("awaiting item") ||
    s.includes("shipper created")
  ) {
    return "INFO_RECEIVED";
  }
  if (s.includes("expired")) return "EXPIRED";
  return "PENDING";
}

function safeDate(raw: string | number | undefined | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// ---------------------------------------------------------------------------
// 1. Universal Keyless Carrier Tracker via Pkge (UPS, FedEx, USPS, DHL, etc.)
// ---------------------------------------------------------------------------
const PKGE_AES_KEY = Buffer.from("tsUlsDJ04cVBAK3D2HzegN48KrYHh2Wq", "utf8");
const PKGE_AES_IV = Buffer.from("xX64KRVu21jsnUw0z03C1PQJkMuxy9l2", "utf8").subarray(0, 16);
const PKGE_WIDGET_KEY = "POox85sYUXoAQ6iHPJqyjwcWuZRBHNuF";

/* eslint-disable @typescript-eslint/no-explicit-any */
function decryptPkgePayload(b64: string): any | null {
  try {
    const decipher = crypto.createDecipheriv("aes-256-cbc", PKGE_AES_KEY, PKGE_AES_IV);
    let out = decipher.update(Buffer.from(b64, "base64"), undefined, "utf8");
    out += decipher.final("utf8");
    return JSON.parse(out);
  } catch {
    return null;
  }
}

function mapPkgeNumericStatus(code: number | undefined, text: string | undefined): ShipmentStatus {
  // pkge status codes: 0=Pending, 1=InfoReceived, 2/3=InTransit, 4=OutForDelivery, 5=Delivered, 6/7=Exception
  if (code === 5) return "DELIVERED";
  if (code === 4) return "OUT_FOR_DELIVERY";
  if (code === 6 || code === 7) return "EXCEPTION";
  if (code === 2 || code === 3) {
    const byText = mapStatusText(text);
    return byText === "PENDING" ? "IN_TRANSIT" : byText;
  }
  if (code === 1) return "INFO_RECEIVED";
  return mapStatusText(text);
}

async function fetchPkgeKeyless(trackingNumber: string, slug: CarrierCode): Promise<NormalizedResult> {
  const tn = trackingNumber.replace(/\s+/g, "").trim();
  const pageUrl = `https://pkge.net/parcel/${encodeURIComponent(tn)}`;
  const apiHeaders = {
    "user-agent": BROWSER_UA,
    "accept-language": "en",
    "x-api-widget-key": PKGE_WIDGET_KEY,
    "x-api-expand-related-objects": "true",
    origin: "https://pkge.net",
    referer: pageUrl,
  };

  const hasRealCheckpoints = (p: any) =>
    Array.isArray(p?.checkpoints) &&
    p.checkpoints.some((c: any) => c?.id && !/may not have been sent yet/i.test(String(c?.location || "")));

  // Determine preferred Pkge courierId (1=USPS, 9=FedEx, 10=DHL, 14=Cainiao, 17=UPS)
  let courierId = PKGE_COURIER_IDS[slug];
  if (!courierId) {
    try {
      const detRes = await fetch(`https://api.pkge.net/v1/couriers/detect?trackNumber=${encodeURIComponent(tn)}`, {
        headers: apiHeaders,
        signal: AbortSignal.timeout(6000),
      });
      if (detRes.ok) {
        const detJson = await detRes.json();
        const detectedList = detJson?.payload ? decryptPkgePayload(detJson.payload) : detJson;
        if (Array.isArray(detectedList) && detectedList.length > 0) {
          const preferred =
            detectedList.find((c: any) => ["usps", "ups", "fedex", "dhl", "cainiao"].includes(c?.slug)) ??
            detectedList[0];
          if (preferred?.id) courierId = Number(preferred.id);
        }
      }
    } catch {
      /* ignore */
    }
  }

  let parcel: any | null = null;

  // 1. Query pure JSON API GET /v1/packages first (works on datacenter IPs without Cloudflare HTML challenge)
  try {
    const getRes = await fetch(`https://api.pkge.net/v1/packages?trackNumber=${encodeURIComponent(tn)}`, {
      headers: apiHeaders,
      signal: AbortSignal.timeout(8000),
    });
    if (getRes.ok) {
      const getJson = await getRes.json();
      if (getJson?.payload) {
        parcel = decryptPkgePayload(getJson.payload);
      }
    } else if (getRes.status === 404 && courierId) {
      // Package not yet registered in Pkge -> register with explicit courierId so USPS is never misclassified as Pitney Bowes
      const createRes = await fetch(
        `https://api.pkge.net/v1/packages?trackNumber=${encodeURIComponent(tn)}&courierId=${courierId}`,
        {
          method: "POST",
          headers: apiHeaders,
          signal: AbortSignal.timeout(8000),
        }
      );
      if (createRes.ok) {
        const createJson = await createRes.json();
        if (createJson?.payload) {
          parcel = decryptPkgePayload(createJson.payload);
        }
      }
    }
  } catch {
    /* ignore */
  }

  // Fallback to HTML page extraction if API GET didn't return a parcel
  const fetchParcelFromPage = async (): Promise<any | null> => {
    try {
      const res = await fetch(pageUrl, {
        headers: {
          "user-agent": BROWSER_UA,
          "accept-language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return null;
      const html = await res.text();
      const m = /new\s+parcelView\("([^"]+)"\)/.exec(html);
      if (!m?.[1]) return null;
      return decryptPkgePayload(m[1]);
    } catch {
      return null;
    }
  };

  if (!parcel) {
    parcel = await fetchParcelFromPage();
  }

  // If still no parcel, try detect-courier POST on pkge.net web + re-fetch
  if (!parcel) {
    try {
      await fetch(
        `https://pkge.net/parcels/detect-courier?trackNumber=${encodeURIComponent(tn)}${courierId ? `&preferredId=${courierId}` : ""}`,
        {
          method: "POST",
          headers: {
            "user-agent": BROWSER_UA,
            "x-requested-with": "XMLHttpRequest",
            origin: "https://pkge.net",
            referer: "https://pkge.net/",
          },
          signal: AbortSignal.timeout(8000),
        }
      );
      parcel = await fetchParcelFromPage();
    } catch {
      /* ignore */
    }
  }

  // If parcel was misclassified (e.g. Pitney Bowes instead of USPS) and has no real checkpoints, switch courier
  if (
    parcel &&
    !hasRealCheckpoints(parcel) &&
    courierId &&
    parcel.courier?.id &&
    Number(parcel.courier.id) !== courierId
  ) {
    try {
      await fetch(`https://pkge.net/parcels/change-courier?trackNumber=${encodeURIComponent(tn)}`, {
        method: "POST",
        headers: {
          "user-agent": BROWSER_UA,
          "content-type": "application/x-www-form-urlencoded",
          "x-requested-with": "XMLHttpRequest",
          origin: "https://pkge.net",
          referer: pageUrl,
        },
        body: `courierId=${encodeURIComponent(String(courierId))}`,
        signal: AbortSignal.timeout(6000),
      });
    } catch {
      /* ignore */
    }
  }

  // Trigger a live carrier refresh and poll updating-status
  if (!parcel || !hasRealCheckpoints(parcel) || parcel.updating) {
    try {
      await fetch(`https://api.pkge.net/v1/packages/update?trackNumber=${encodeURIComponent(tn)}`, {
        method: "POST",
        headers: apiHeaders,
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      /* ignore */
    }

    for (let poll = 0; poll < 7; poll++) {
      await new Promise((r) => setTimeout(r, 1800));
      try {
        const pollRes = await fetch(
          `https://api.pkge.net/v1/packages/updating-status?trackNumber=${encodeURIComponent(tn)}&hash=${encodeURIComponent(parcel?.hash || "")}`,
          {
            headers: apiHeaders,
            signal: AbortSignal.timeout(8000),
          }
        );
        if (pollRes.ok) {
          const pollJson = await pollRes.json();
          const dec = pollJson?.payload ? decryptPkgePayload(pollJson.payload) : null;
          // IMPORTANT: updating-status returns the updated parcel under `dec.package` (or `dec.parcel`)
          const updatedPkg = dec?.package ?? dec?.parcel;
          if (updatedPkg) {
            parcel = updatedPkg;
          }
          if (dec && !dec.updating && hasRealCheckpoints(parcel)) break;
          if (dec && !dec.updating && poll >= 1) break;
        }
      } catch {
        break;
      }
    }
  } else {
    // Even if parcel already had checkpoints, do a fast check on updating-status with empty hash to get latest state
    try {
      const latestRes = await fetch(
        `https://api.pkge.net/v1/packages/updating-status?trackNumber=${encodeURIComponent(tn)}&hash=`,
        {
          headers: apiHeaders,
          signal: AbortSignal.timeout(6000),
        }
      );
      if (latestRes.ok) {
        const latestJson = await latestRes.json();
        const dec = latestJson?.payload ? decryptPkgePayload(latestJson.payload) : null;
        const updatedPkg = dec?.package ?? dec?.parcel;
        if (updatedPkg && Array.isArray(updatedPkg.checkpoints) && updatedPkg.checkpoints.length >= (parcel.checkpoints?.length || 0)) {
          parcel = updatedPkg;
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (!parcel) {
    return {
      found: false,
      carrierCode: slug,
      carrierName: carrierDisplayName(slug),
      status: "PENDING",
      delivered: false,
      events: [],
    };
  }

  const rawCheckpoints: any[] = Array.isArray(parcel?.checkpoints) ? parcel.checkpoints : [];
  const events: NormalizedEvent[] = [];
  for (const cp of rawCheckpoints) {
    const desc = String(cp?.title || "").trim();
    const loc = String(cp?.location || "").trim();
    if (!desc || /may not have been sent yet/i.test(loc) || /tracking has started/i.test(desc)) continue;
    const t = safeDate(cp?.date);
    if (!t) continue;
    events.push({
      time: t,
      description: desc,
      location: loc || undefined,
      status: mapStatusText(desc),
    });
  }

  // Sort events newest first so events[0] is always the most recent checkpoint
  events.sort((a, b) => b.time.getTime() - a.time.getTime());

  const latestEventDesc = events[0]?.description || "";
  const statusText = String(latestEventDesc || parcel?.last_status || parcel?.status_description || "");
  let status = events.length > 0 ? mapPkgeNumericStatus(parcel?.status, statusText) : "PENDING";
  // If any checkpoint explicitly indicates DELIVERED, or the newest event is OUT_FOR_DELIVERY, reflect that accurately
  if (events.some((e) => e.status === "DELIVERED")) {
    status = "DELIVERED";
  } else if (events[0]?.status === "OUT_FOR_DELIVERY" && status === "IN_TRANSIT") {
    status = "OUT_FOR_DELIVERY";
  }

  const delivered = status === "DELIVERED";
  const estimatedDelivery = safeDate(parcel?.est_delivery_date_from || parcel?.est_delivery_date_to);
  const detectedCourierName = parcel?.courier?.name || carrierDisplayName(slug);
  const detectedCourierSlug = parcel?.courier?.slug || slug;

  return {
    found: events.length > 0 || status !== "PENDING",
    carrierCode: detectedCourierSlug,
    carrierName: detectedCourierName,
    status,
    statusDetail: statusText || undefined,
    estimatedDelivery,
    delivered,
    events,
    raw: parcel,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// 2A. Keyless USPS / DHL eCommerce Consolidator JSON API (926129..., 927489..., 936128..., 420..., GM...)
// ---------------------------------------------------------------------------
/* eslint-disable @typescript-eslint/no-explicit-any */
async function fetchDhlEcommerceKeyless(trackingNumber: string, slug: CarrierCode): Promise<NormalizedResult> {
  const tn = trackingNumber.replace(/\s+/g, "").trim();
  const candidates = [tn];
  // If 30-digit IMpb barcode starting with 420 + 5/9 digit zip + 92/93/94..., also try the 22-digit USPS tracking number
  const impbMatch = /^420\d{5}(?:\d{4})?((?:92|93|94|95)\d{20,22})$/.exec(tn);
  if (impbMatch?.[1]) candidates.push(impbMatch[1]);

  try {
    const res = await fetch("https://api.dhlecs.com/webtrack/v4/tracking", {
      method: "POST",
      headers: {
        "user-agent": BROWSER_UA,
        "content-type": "application/json",
        accept: "application/json",
        origin: "https://webtrack.dhlglobalmail.com",
        referer: "https://webtrack.dhlglobalmail.com/",
      },
      body: JSON.stringify({ trackedValue: candidates.join(","), offset: 0, locale: "en-US" }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return {
        found: false,
        carrierCode: slug,
        carrierName: carrierDisplayName(slug),
        status: "PENDING",
        delivered: false,
        events: [],
      };
    }
    const json = await res.json();
    const pkg = json?.packages?.[0];
    if (!pkg || !Array.isArray(pkg.events) || pkg.events.length === 0) {
      return {
        found: false,
        carrierCode: slug,
        carrierName: carrierDisplayName(slug),
        status: "PENDING",
        delivered: false,
        events: [],
      };
    }

    const events: NormalizedEvent[] = [];
    for (const ev of pkg.events) {
      const primary = String(ev?.primaryEventDescription || "").trim();
      const secondary = String(ev?.secondaryEventDescription || "").trim();
      const desc = secondary && !primary.toLowerCase().includes(secondary.toLowerCase())
        ? `${primary} (${secondary})`
        : primary;
      if (!desc) continue;
      const dateStr = ev?.date && ev?.time ? `${ev.date}T${ev.time}` : ev?.date;
      const t = safeDate(dateStr) ?? new Date();
      events.push({
        time: t,
        description: desc,
        location: ev?.location ? String(ev.location).trim() : undefined,
        status: mapStatusText(primary || desc),
      });
    }

    events.sort((a, b) => b.time.getTime() - a.time.getTime());

    const rawStatus = String(pkg.status || events[0]?.description || "");
    let status = mapStatusText(rawStatus);
    if (events.some((e) => e.status === "DELIVERED")) {
      status = "DELIVERED";
    } else if (events[0]?.status === "OUT_FOR_DELIVERY" && status === "IN_TRANSIT") {
      status = "OUT_FOR_DELIVERY";
    }

    const effectiveSlug: CarrierCode =
      slug !== "other" ? slug : String(pkg.dspName || "").toUpperCase() === "USPS" ? "usps" : "dhl";

    return {
      found: true,
      carrierCode: effectiveSlug,
      carrierName: carrierDisplayName(effectiveSlug),
      status,
      statusDetail: events[0]?.description || rawStatus || undefined,
      estimatedDelivery: safeDate(pkg.estimatedDeliveryDate),
      delivered: status === "DELIVERED",
      events,
      raw: pkg,
    };
  } catch {
    return {
      found: false,
      carrierCode: slug,
      carrierName: carrierDisplayName(slug),
      status: "PENDING",
      delivered: false,
      events: [],
    };
  }
}

// ---------------------------------------------------------------------------
// 2B. Keyless Ship24 Universal API (FedEx, UPS, USPS, DHL, Royal Mail, etc.)
// ---------------------------------------------------------------------------
function murmurHash3x8632(key: string, seed = 0): number {
  let h1 = seed >>> 0;
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;
  const imul = Math.imul;
  const len = key.length;
  const roundedEnd = len & ~0x3;

  for (let i = 0; i < roundedEnd; i += 4) {
    let k1 =
      (key.charCodeAt(i) & 0xff) |
      ((key.charCodeAt(i + 1) & 0xff) << 8) |
      ((key.charCodeAt(i + 2) & 0xff) << 16) |
      ((key.charCodeAt(i + 3) & 0xff) << 24);
    k1 = imul(k1, c1);
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 = imul(k1, c2);
    h1 ^= k1;
    h1 = (h1 << 13) | (h1 >>> 19);
    h1 = (imul(h1, 5) + 0xe6546b64) | 0;
  }

  let k1 = 0;
  switch (len & 3) {
    case 3:
      k1 ^= (key.charCodeAt(roundedEnd + 2) & 0xff) << 16;
    // falls through
    case 2:
      k1 ^= (key.charCodeAt(roundedEnd + 1) & 0xff) << 8;
    // falls through
    case 1:
      k1 ^= key.charCodeAt(roundedEnd) & 0xff;
      k1 = imul(k1, c1);
      k1 = (k1 << 15) | (k1 >>> 17);
      k1 = imul(k1, c2);
      h1 ^= k1;
  }

  h1 ^= len;
  h1 ^= h1 >>> 16;
  h1 = imul(h1, 0x85ebca6b);
  h1 ^= h1 >>> 13;
  h1 = imul(h1, 0xc2b2ae35);
  h1 ^= h1 >>> 16;
  return h1 >>> 0;
}

function makeShip24Token(): string {
  const n = crypto
    .createHash("sha256")
    .update(`${BROWSER_UA}_1920x1080_en-US_America/New_York`)
    .digest("hex");
  const r = murmurHash3x8632(n + "\u1780", 0);
  const c = String(Date.now());
  const d = c.slice(3, 10);
  const msg = `${d}${r}`;
  const sig = crypto.createHmac("sha256", "qxV6SOr2tqw9m36j0-R-ohPt1PAB2et0").update(msg).digest("hex");
  return `${c.slice(0, 3)}${sig}${c.slice(3)}`;
}

async function fetchShip24Keyless(trackingNumber: string, slug: CarrierCode): Promise<NormalizedResult> {
  const tn = trackingNumber.replace(/\s+/g, "").trim();
  try {
    const res = await fetch(`https://api.ship24.com/api/parcels/${encodeURIComponent(tn)}?lang=en`, {
      method: "POST",
      headers: {
        "user-agent": BROWSER_UA,
        "content-type": "application/json",
        accept: "application/json, text/plain, */*",
        "x-ship24-token": makeShip24Token(),
        origin: "https://www.ship24.com",
        referer: `https://www.ship24.com/tracking?p=${encodeURIComponent(tn)}`,
      },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      return {
        found: false,
        carrierCode: slug,
        carrierName: carrierDisplayName(slug),
        status: "PENDING",
        delivered: false,
        events: [],
      };
    }
    const json = await res.json();
    const rawEvents: any[] = Array.isArray(json?.data?.events) ? json.data.events : [];
    if (rawEvents.length === 0) {
      return {
        found: false,
        carrierCode: slug,
        carrierName: carrierDisplayName(slug),
        status: "PENDING",
        delivered: false,
        events: [],
      };
    }

    const events: NormalizedEvent[] = [];
    for (const ev of rawEvents) {
      const desc = String(ev?.event || ev?.status || "").trim();
      if (!desc) continue;
      const t = safeDate(ev?.datetime || ev?.occurrenceDatetime) ?? new Date();
      events.push({
        time: t,
        description: desc,
        location: ev?.location ? String(ev.location).trim() : undefined,
        status: mapStatusText(ev?.statusCode || ev?.statusCategory || desc),
      });
    }

    events.sort((a, b) => b.time.getTime() - a.time.getTime());

    let status = mapStatusText(events[0]?.description);
    if (events.some((e) => e.status === "DELIVERED")) {
      status = "DELIVERED";
    } else if (events[0]?.status === "OUT_FOR_DELIVERY" && status === "IN_TRANSIT") {
      status = "OUT_FOR_DELIVERY";
    }

    return {
      found: events.length > 0,
      carrierCode: slug,
      carrierName: carrierDisplayName(slug),
      status,
      statusDetail: events[0]?.description || undefined,
      delivered: status === "DELIVERED",
      events,
      raw: json?.data,
    };
  } catch {
    return {
      found: false,
      carrierCode: slug,
      carrierName: carrierDisplayName(slug),
      status: "PENDING",
      delivered: false,
      events: [],
    };
  }
}

// ---------------------------------------------------------------------------
// 2C. Keyless PackageRadar SSR Tracker (UPS, USPS, FedEx, DHL)
// ---------------------------------------------------------------------------
const PACKAGERADAR_SLUGS: Partial<Record<CarrierCode, string>> = {
  ups: "ups",
  usps: "usps",
  fedex: "fedex",
  dhl: "dhl",
  cainiao: "cainiao",
};

async function fetchPackageRadarKeyless(trackingNumber: string, slug: CarrierCode): Promise<NormalizedResult> {
  const tn = trackingNumber.replace(/\s+/g, "").trim();
  const courierPath = PACKAGERADAR_SLUGS[slug] || "usps";
  try {
    const res = await fetch(`https://packageradar.com/courier/${courierPath}/tracking/${encodeURIComponent(tn)}`, {
      headers: {
        "user-agent": BROWSER_UA,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      return {
        found: false,
        carrierCode: slug,
        carrierName: carrierDisplayName(slug),
        status: "PENDING",
        delivered: false,
        events: [],
      };
    }
    const html = await res.text();
    const ulMatch = /<ul class="checkpoints">([\s\S]*?)<\/ul>/i.exec(html);
    if (!ulMatch?.[1]) {
      return {
        found: false,
        carrierCode: slug,
        carrierName: carrierDisplayName(slug),
        status: "PENDING",
        delivered: false,
        events: [],
      };
    }

    const strip = (s: string) =>
      s
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/\s+/g, " ")
        .trim();

    const events: NormalizedEvent[] = [];
    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let m: RegExpExecArray | null;
    while ((m = liRegex.exec(ulMatch[1])) !== null) {
      const block = m[1];
      const dtMatch = /datetime="([^"]+)"/i.exec(block);
      const statusMatch = /class="[^"]*checkpoint-status[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(block);
      const locMatch = /<em class="text-muted">([\s\S]*?)<\/em>/i.exec(block);
      const desc = statusMatch ? strip(statusMatch[1]) : "";
      if (!desc || /package may not have been sent yet/i.test(desc)) continue;
      const t = dtMatch?.[1] ? safeDate(dtMatch[1]) : null;
      if (!t) continue;
      events.push({
        time: t,
        description: desc,
        location: locMatch ? strip(locMatch[1]) || undefined : undefined,
        status: mapStatusText(desc),
      });
    }

    if (events.length === 0) {
      return {
        found: false,
        carrierCode: slug,
        carrierName: carrierDisplayName(slug),
        status: "PENDING",
        delivered: false,
        events: [],
      };
    }

    events.sort((a, b) => b.time.getTime() - a.time.getTime());

    let status: ShipmentStatus = mapStatusText(events[0].description);
    if (events.some((e) => e.status === "DELIVERED")) {
      status = "DELIVERED";
    } else if (events[0]?.status === "OUT_FOR_DELIVERY" && status === "IN_TRANSIT") {
      status = "OUT_FOR_DELIVERY";
    }

    return {
      found: true,
      carrierCode: slug,
      carrierName: carrierDisplayName(slug),
      status,
      statusDetail: events[0]?.description || undefined,
      delivered: status === "DELIVERED",
      events,
    };
  } catch {
    return {
      found: false,
      carrierCode: slug,
      carrierName: carrierDisplayName(slug),
      status: "PENDING",
      delivered: false,
      events: [],
    };
  }
}

// ---------------------------------------------------------------------------
// 2D. Direct Keyless USPS Tracking Scraper Fallback
// ---------------------------------------------------------------------------
/* eslint-enable @typescript-eslint/no-explicit-any */
async function fetchUspsKeyless(trackingNumber: string): Promise<NormalizedResult> {
  const tn = trackingNumber.replace(/\s+/g, "");
  try {
    const res = await fetch(
      `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(tn)}`,
      {
        headers: {
          "user-agent": BROWSER_UA,
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(12000),
      }
    );
    if (!res.ok) {
      return {
        found: false,
        carrierCode: "usps",
        carrierName: "USPS",
        status: "PENDING",
        delivered: false,
        events: [],
      };
    }
    const html = await res.text();
    const strip = (s: string) =>
      s
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/\s+/g, " ")
        .trim();

    const bannerMatch =
      /<h[1234][^>]*class="[^"]*(?:tb-status|delivery_status|status_category|banner-header)[^"]*"[^>]*>([\s\S]*?)<\/h[1234]>/i.exec(
        html
      ) ||
      /<div[^>]*class="[^"]*latest-status[^"]*"[^>]*>[\s\S]*?<h[1234][^>]*>([\s\S]*?)<\/h[1234]>/i.exec(html);

    const statusText = bannerMatch ? strip(bannerMatch[1]) : "";
    const events: NormalizedEvent[] = [];
    const stepRegex =
      /<div[^>]*class="[^"]*tb-step[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*tb-step|<\/div>\s*<\/div>\s*<\/div>)/gi;
    let m: RegExpExecArray | null;
    while ((m = stepRegex.exec(html)) !== null) {
      const block = m[1];
      const detail = /class="[^"]*tb-status-detail[^"]*"[^>]*>([\s\S]*?)<\//i.exec(block);
      const loc = /class="[^"]*tb-location[^"]*"[^>]*>([\s\S]*?)<\//i.exec(block);
      const dateStr = /class="[^"]*tb-date[^"]*"[^>]*>([\s\S]*?)<\//i.exec(block);
      const desc = detail ? strip(detail[1]) : "";
      if (!desc) continue;
      const t = dateStr ? safeDate(strip(dateStr[1])) : null;
      events.push({
        time: t ?? new Date(),
        description: desc,
        location: loc ? strip(loc[1]) || undefined : undefined,
        status: mapStatusText(desc),
      });
    }

    if (!statusText && events.length === 0) {
      return {
        found: false,
        carrierCode: "usps",
        carrierName: "USPS",
        status: "PENDING",
        delivered: false,
        events: [],
      };
    }

    const status = mapStatusText(statusText || events[0]?.description);
    return {
      found: true,
      carrierCode: "usps",
      carrierName: "USPS",
      status,
      statusDetail: statusText || events[0]?.description || undefined,
      delivered: status === "DELIVERED",
      events,
    };
  } catch {
    return {
      found: false,
      carrierCode: "usps",
      carrierName: "USPS",
      status: "PENDING",
      delivered: false,
      events: [],
    };
  }
}

// ---------------------------------------------------------------------------
// 3. Keyless Carrier Orchestrator (DHL eCS/USPS + Ship24 + PackageRadar + Pkge + USPS + Cainiao)
// ---------------------------------------------------------------------------
async function fetchKeylessCarrier(trackingNumber: string, carrierHint?: string | null): Promise<NormalizedResult> {
  const slug = detectCarrier(trackingNumber, carrierHint);

  // 1. Fast JSON check for USPS Ground Advantage / Shipping Partner / DHL eCommerce (926129..., 927489..., 936128..., 420...)
  if (slug === "usps" || slug === "dhl" || slug === "other") {
    const dhlEcs = await fetchDhlEcommerceKeyless(trackingNumber, slug);
    if (dhlEcs.found && dhlEcs.events.length > 0) {
      return dhlEcs;
    }
  }

  // 2. Fast JSON check via Ship24 universal API (FedEx, UPS, USPS, DHL, YunExpress, etc.)
  const ship24 = await fetchShip24Keyless(trackingNumber, slug);
  if (ship24.found && ship24.events.length > 0) {
    return ship24;
  }

  // 3. Fast SSR check via PackageRadar (UPS, USPS, FedEx, DHL)
  const pkgRadar = await fetchPackageRadarKeyless(trackingNumber, slug);
  if (pkgRadar.found && pkgRadar.events.length > 0) {
    return pkgRadar;
  }

  // 4. Universal keyless tracker via Pkge (supports UPS, FedEx, USPS, DHL, etc. with live polling)
  const pkgeResult = await fetchPkgeKeyless(trackingNumber, slug);
  if (pkgeResult.found && pkgeResult.events.length > 0) {
    return pkgeResult;
  }

  // 5. Direct USPS scraper fallback if USPS number
  if (slug === "usps") {
    const uspsDirect = await fetchUspsKeyless(trackingNumber);
    if (uspsDirect.found && uspsDirect.events.length > 0) {
      return uspsDirect;
    }
  }

  // 6. Cainiao Global network (often indexes cross-border USPS/UPS/FedEx handoff numbers)
  try {
    const cn = await cainiaoProvider.fetch(trackingNumber);
    if (cn.found && cn.events.length > 0) {
      return {
        ...cn,
        carrierCode: slug === "other" ? cn.carrierCode : slug,
        carrierName: slug === "other" ? cn.carrierName : carrierDisplayName(slug),
      };
    }
  } catch {
    /* ignore */
  }

  return pkgeResult;
}

// ---------------------------------------------------------------------------
// Optional Aggregator Providers (AfterShip / TrackingMore)
// ---------------------------------------------------------------------------
function mapAggregatorTag(tag: string | undefined): ShipmentStatus {
  switch ((tag || "").toLowerCase()) {
    case "delivered":
      return "DELIVERED";
    case "outfordelivery":
    case "out_for_delivery":
      return "OUT_FOR_DELIVERY";
    case "intransit":
    case "in_transit":
      return "IN_TRANSIT";
    case "inforeceived":
    case "info_received":
      return "INFO_RECEIVED";
    case "exception":
    case "attemptfail":
    case "undelivered":
      return "EXCEPTION";
    case "expired":
      return "EXPIRED";
    case "pending":
    default:
      return "PENDING";
  }
}

function aftershipProvider(apiKey: string, hint?: CarrierCode): TrackingProvider {
  const base = "https://api.aftership.com/v4";
  const headers = { "aftership-api-key": apiKey, "content-type": "application/json" };

  return {
    code: hint ?? "aftership",
    deepLink: (tn) => carrierDeepLink(tn, hint),
    async fetch(trackingNumber: string): Promise<NormalizedResult> {
      const slug = detectCarrier(trackingNumber, hint);
      try {
        await fetch(`${base}/trackings`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            tracking: { tracking_number: trackingNumber, ...(slug !== "other" ? { slug } : {}) },
          }),
          signal: AbortSignal.timeout(10000),
        }).catch(() => null);

        const url =
          slug !== "other"
            ? `${base}/trackings/${slug}/${encodeURIComponent(trackingNumber)}`
            : `${base}/trackings?tracking_numbers=${encodeURIComponent(trackingNumber)}`;
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
        if (!res.ok) {
          return await fetchKeylessCarrier(trackingNumber, hint);
        }
        const json = await res.json();
        const t = json?.data?.tracking ?? json?.data?.trackings?.[0];
        if (!t) return await fetchKeylessCarrier(trackingNumber, hint);

        const checkpoints: Array<Record<string, unknown>> = Array.isArray(t.checkpoints) ? t.checkpoints : [];
        const events: NormalizedEvent[] = checkpoints
          .map((c) => {
            const time = safeDate(c.checkpoint_time as string);
            const description = String(c.message || c.subtag_message || "").trim();
            if (!time || !description) return null;
            const loc =
              [c.city, c.state, c.country_name].filter(Boolean).join(", ") || (c.location as string) || undefined;
            return {
              time,
              description,
              location: loc,
              status: mapAggregatorTag(c.tag as string),
            };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null);

        const status = mapAggregatorTag(t.tag);
        const delivered = status === "DELIVERED";
        const eta = safeDate(t.expected_delivery);

        return {
          found: events.length > 0 || status !== "PENDING",
          carrierCode: t.slug || slug,
          carrierName: carrierDisplayName(slug),
          status,
          statusDetail: t.subtag_message || events[0]?.description || undefined,
          estimatedDelivery: eta,
          delivered,
          events,
          raw: t,
        };
      } catch {
        return await fetchKeylessCarrier(trackingNumber, hint);
      }
    },
  };
}

function trackingMoreProvider(apiKey: string, hint?: CarrierCode): TrackingProvider {
  const base = "https://api.trackingmore.com/v4";
  const headers = { "Tracking-Api-Key": apiKey, "Content-Type": "application/json" };

  return {
    code: hint ?? "trackingmore",
    deepLink: (tn) => carrierDeepLink(tn, hint),
    async fetch(trackingNumber: string): Promise<NormalizedResult> {
      const slug = detectCarrier(trackingNumber, hint);
      const courierCode = slug === "other" ? "usps" : slug;
      try {
        await fetch(`${base}/trackings/create`, {
          method: "POST",
          headers,
          body: JSON.stringify({ tracking_number: trackingNumber, courier_code: courierCode }),
          signal: AbortSignal.timeout(10000),
        }).catch(() => null);

        const res = await fetch(
          `${base}/trackings/get?tracking_numbers=${encodeURIComponent(trackingNumber)}`,
          { headers, signal: AbortSignal.timeout(10000) }
        );
        if (!res.ok) return await fetchKeylessCarrier(trackingNumber, hint);
        const json = await res.json();
        const t = json?.data?.[0];
        if (!t) return await fetchKeylessCarrier(trackingNumber, hint);

        const rawEvents: Array<Record<string, unknown>> =
          t?.origin_info?.trackinfo ?? t?.destination_info?.trackinfo ?? [];
        const events: NormalizedEvent[] = rawEvents
          .map((c) => {
            const time = safeDate((c.checkpoint_date as string) || (c.Date as string));
            const description = String(c.tracking_detail || c.StatusDescription || "").trim();
            if (!time || !description) return null;
            return {
              time,
              description,
              location: (c.location as string) || (c.Details as string) || undefined,
              status: mapAggregatorTag(c.checkpoint_delivery_status as string),
            };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null);

        const status = mapAggregatorTag(t.delivery_status);
        const delivered = status === "DELIVERED";
        const eta = safeDate(t.scheduled_delivery_date);

        return {
          found: events.length > 0 || status !== "PENDING",
          carrierCode: t.courier_code || courierCode,
          carrierName: carrierDisplayName(slug),
          status,
          statusDetail: t.latest_event || events[0]?.description || undefined,
          estimatedDelivery: eta,
          delivered,
          events,
          raw: t,
        };
      } catch {
        return await fetchKeylessCarrier(trackingNumber, hint);
      }
    },
  };
}

export function makeCarrierProvider(hint?: CarrierCode, config?: TrackingConfig): TrackingProvider {
  const provider = (config?.provider || process.env.CUSTOMER_TRACKING_PROVIDER || "none").toLowerCase();
  const key = config?.apiKey || process.env.CUSTOMER_TRACKING_API_KEY || "";
  if (key) {
    if (provider === "aftership") return aftershipProvider(key, hint);
    if (provider === "trackingmore") return trackingMoreProvider(key, hint);
  }
  return {
    code: hint ?? "other",
    deepLink: (tn) => carrierDeepLink(tn, hint),
    async fetch(trackingNumber: string): Promise<NormalizedResult> {
      return await fetchKeylessCarrier(trackingNumber, hint);
    },
  };
}

export const getCarrierProvider = (opts?: { provider?: string | null; apiKey?: string | null }) =>
  makeCarrierProvider(undefined, { provider: opts?.provider ?? undefined, apiKey: opts?.apiKey ?? undefined });
