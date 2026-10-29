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

export type CarrierCode = "fedex" | "usps" | "ups" | "other";
export type CarrierSlug = CarrierCode;

export interface TrackingConfig {
  provider?: string;
  apiKey?: string;
}

export const CARRIER_NAMES: Record<CarrierCode, string> = {
  fedex: "FedEx",
  usps: "USPS",
  ups: "UPS",
  other: "Carrier",
};

export function detectCarrier(trackingNumber: string, hint?: string | null): CarrierCode {
  const h = hint?.toLowerCase().trim();
  if (h === "usps" || h === "ups" || h === "fedex") return h;
  const tn = trackingNumber.replace(/\s+/g, "").toUpperCase();
  if (/^1Z[0-9A-Z]{16}$/.test(tn)) return "ups";
  if (/^(94|93|92|95)\d{18,24}$/.test(tn) || /^[A-Z]{2}\d{9}US$/.test(tn) || /^420\d{25,31}$/.test(tn)) {
    return "usps";
  }
  if (/^\d{12}$/.test(tn) || /^\d{15}$/.test(tn) || /^\d{20}$/.test(tn) || /^\d{22}$/.test(tn)) {
    return "fedex";
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
  const tn = trackingNumber.trim();
  const pageUrl = `https://pkge.net/parcel/${encodeURIComponent(tn)}`;

  const fetchParcelFromPage = async (): Promise<any | null> => {
    const res = await fetch(pageUrl, {
      headers: {
        "user-agent": BROWSER_UA,
        "accept-language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m = /new\s+parcelView\("([^"]+)"\)/.exec(html);
    if (!m?.[1]) return null;
    return decryptPkgePayload(m[1]);
  };

  let parcel = await fetchParcelFromPage();
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

  const hasRealCheckpoints = (p: any) =>
    Array.isArray(p?.checkpoints) &&
    p.checkpoints.some((c: any) => c?.id && !/may not have been sent yet/i.test(String(c?.location || "")));

  // Trigger a live carrier refresh if package was never tracked or has no real checkpoints yet
  if (!hasRealCheckpoints(parcel) || parcel.updating) {
    try {
      await fetch(`https://api.pkge.net/v1/packages/update?trackNumber=${encodeURIComponent(tn)}`, {
        method: "POST",
        headers: {
          "user-agent": BROWSER_UA,
          "accept-language": "en",
          "x-api-widget-key": PKGE_WIDGET_KEY,
          "x-api-expand-related-objects": "true",
          origin: "https://pkge.net",
          referer: pageUrl,
        },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      /* ignore */
    }

    for (let poll = 0; poll < 6; poll++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const pollRes = await fetch(
          `https://api.pkge.net/v1/packages/updating-status?trackNumber=${encodeURIComponent(tn)}&hash=${encodeURIComponent(parcel.hash || "")}`,
          {
            headers: {
              "user-agent": BROWSER_UA,
              "accept-language": "en",
              "x-api-widget-key": PKGE_WIDGET_KEY,
              "x-api-expand-related-objects": "true",
              origin: "https://pkge.net",
              referer: pageUrl,
            },
            signal: AbortSignal.timeout(8000),
          }
        );
        if (pollRes.ok) {
          const pollJson = await pollRes.json();
          const dec = pollJson?.payload ? decryptPkgePayload(pollJson.payload) : null;
          if (dec?.parcel) {
            parcel = dec.parcel;
          }
          if (dec && !dec.updating) break;
        }
      } catch {
        break;
      }
    }

    if (!hasRealCheckpoints(parcel)) {
      const refreshed = await fetchParcelFromPage();
      if (refreshed) parcel = refreshed;
    }
  }

  const rawCheckpoints: any[] = Array.isArray(parcel?.checkpoints) ? parcel.checkpoints : [];
  const events: NormalizedEvent[] = [];
  for (const cp of rawCheckpoints) {
    const desc = String(cp?.title || "").trim();
    const loc = String(cp?.location || "").trim();
    if (!desc || /may not have been sent yet/i.test(loc)) continue;
    const t = safeDate(cp?.date);
    if (!t) continue;
    events.push({
      time: t,
      description: desc,
      location: loc || undefined,
      status: mapStatusText(desc),
    });
  }

  const statusText = String(parcel?.last_status || parcel?.status_description || events[0]?.description || "");
  const status = events.length > 0 ? mapPkgeNumericStatus(parcel?.status, statusText) : "PENDING";
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
// 2. Direct Keyless USPS Tracking Scraper Fallback
// ---------------------------------------------------------------------------
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
// 3. Keyless Carrier Orchestrator (Pkge + USPS + Cainiao fallback)
// ---------------------------------------------------------------------------
async function fetchKeylessCarrier(trackingNumber: string, carrierHint?: string | null): Promise<NormalizedResult> {
  const slug = detectCarrier(trackingNumber, carrierHint);

  // Primary: universal keyless tracker via Pkge (supports UPS, FedEx, USPS, DHL, etc.)
  const pkgeResult = await fetchPkgeKeyless(trackingNumber, slug);
  if (pkgeResult.found && pkgeResult.events.length > 0) {
    return pkgeResult;
  }

  // Fallback A: direct USPS scraper if USPS number
  if (slug === "usps") {
    const uspsDirect = await fetchUspsKeyless(trackingNumber);
    if (uspsDirect.found && uspsDirect.events.length > 0) {
      return uspsDirect;
    }
  }

  // Fallback B: Cainiao Global network (often indexes cross-border USPS/UPS/FedEx handoff numbers)
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
