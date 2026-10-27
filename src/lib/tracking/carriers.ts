import type { ShipmentStatus } from "@prisma/client";
import { NormalizedEvent, NormalizedResult, TrackingProvider, emptyResult } from "./types";

// Customer-facing carriers (FedEx / USPS / UPS / DHL ...).
//
// There is no universally-free carrier API. This module therefore:
//   1. Always provides a correct deep-link so the number is viewable.
//   2. Auto-detects the carrier from the number format.
//   3. If CUSTOMER_TRACKING_PROVIDER + key are configured, uses that aggregator
//      (AfterShip or TrackingMore) for real status + events.
//   4. Otherwise returns a non-fatal "manual" result (worker won't thrash).

export type CarrierCode = "fedex" | "usps" | "ups" | "dhl" | "unknown";

export const CARRIER_NAMES: Record<CarrierCode, string> = {
  fedex: "FedEx",
  usps: "USPS",
  ups: "UPS",
  dhl: "DHL",
  unknown: "Carrier",
};

export function detectCarrier(n: string): CarrierCode {
  const t = n.replace(/\s+/g, "").toUpperCase();
  if (/^1Z[0-9A-Z]{16}$/.test(t)) return "ups";
  if (/^(94|93|92|95|91|420)\d{18,}$/.test(t) || /^[A-Z]{2}\d{9}US$/.test(t)) return "usps";
  if (/^\d{12}$/.test(t) || /^\d{15}$/.test(t) || /^\d{20,22}$/.test(t)) return "fedex";
  if (/^\d{10}$/.test(t) || /^JD\d{18}$/.test(t)) return "dhl";
  return "unknown";
}

export function carrierDeepLink(carrier: CarrierCode, n: string): string {
  const e = encodeURIComponent(n);
  switch (carrier) {
    case "fedex":
      return `https://www.fedex.com/fedextrack/?trknbr=${e}`;
    case "usps":
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${e}`;
    case "ups":
      return `https://www.ups.com/track?tracknum=${e}`;
    case "dhl":
      return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${e}`;
    default:
      return `https://www.google.com/search?q=${e}+tracking`;
  }
}

function mapAggregatorTag(tag: string | undefined): ShipmentStatus {
  const s = (tag || "").toUpperCase();
  if (/DELIVERED/.test(s)) return "DELIVERED";
  if (/OUT.?FOR.?DELIVERY|OUTFORDELIVERY/.test(s)) return "OUT_FOR_DELIVERY";
  if (/EXCEPTION|FAILED|UNDELIVERED|ALERT/.test(s)) return "EXCEPTION";
  if (/EXPIRED/.test(s)) return "EXPIRED";
  if (/TRANSIT|INFORECEIVED|IN_TRANSIT/.test(s)) return "IN_TRANSIT";
  if (/PENDING|NOTFOUND/.test(s)) return "PENDING";
  return "UNKNOWN";
}

// --- AfterShip adapter (best-effort; needs key) ---
async function fetchAfterShip(n: string, carrier: CarrierCode, key: string): Promise<NormalizedResult> {
  try {
    const res = await fetch(`https://api.aftership.com/v4/trackings/${carrier}/${encodeURIComponent(n)}`, {
      headers: { "aftership-api-key": key, "content-type": "application/json" },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return emptyResult(false);
    const body = (await res.json()) as any;
    const t = body?.data?.tracking;
    if (!t) return emptyResult(false);
    const events: NormalizedEvent[] = (t.checkpoints || []).map((c: any) => ({
      time: new Date(c.checkpoint_time),
      status: c.tag || c.subtag || "UPDATE",
      location: [c.city, c.state, c.country_name].filter(Boolean).join(", ") || undefined,
      description: c.message || c.tag || "Update",
    }));
    const status = mapAggregatorTag(t.tag);
    return {
      found: true,
      status,
      statusDetail: t.subtag_message || t.tag,
      carrierCode: carrier,
      carrierName: CARRIER_NAMES[carrier],
      estimatedDelivery: t.expected_delivery ? new Date(t.expected_delivery) : null,
      delivered: status === "DELIVERED",
      events: events.sort((a, b) => b.time.getTime() - a.time.getTime()),
      raw: t,
    };
  } catch {
    return emptyResult(false);
  }
}

// --- TrackingMore adapter (best-effort; needs key) ---
async function fetchTrackingMore(n: string, carrier: CarrierCode, key: string): Promise<NormalizedResult> {
  try {
    const res = await fetch(`https://api.trackingmore.com/v4/trackings/get?tracking_numbers=${encodeURIComponent(n)}`, {
      headers: { "Tracking-Api-Key": key, "content-type": "application/json" },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return emptyResult(false);
    const body = (await res.json()) as any;
    const t = body?.data?.[0];
    if (!t) return emptyResult(false);
    const events: NormalizedEvent[] = (t.origin_info?.trackinfo || t.destination_info?.trackinfo || []).map((c: any) => ({
      time: new Date(c.checkpoint_date),
      status: c.checkpoint_delivery_status || "UPDATE",
      location: c.location || undefined,
      description: c.tracking_detail || "Update",
    }));
    const status = mapAggregatorTag(t.delivery_status);
    return {
      found: true,
      status,
      statusDetail: t.delivery_status,
      carrierCode: carrier,
      carrierName: CARRIER_NAMES[carrier],
      estimatedDelivery: t.scheduled_delivery_date ? new Date(t.scheduled_delivery_date) : null,
      delivered: status === "DELIVERED",
      events: events.sort((a, b) => b.time.getTime() - a.time.getTime()),
      raw: t,
    };
  } catch {
    return emptyResult(false);
  }
}

export interface TrackingConfig {
  provider: string;
  apiKey: string;
}

export function makeCarrierProvider(forcedCarrier?: CarrierCode, config?: TrackingConfig): TrackingProvider {
  return {
    code: "carrier",
    deepLink(trackingNumber: string) {
      const c = forcedCarrier && forcedCarrier !== "unknown" ? forcedCarrier : detectCarrier(trackingNumber);
      return carrierDeepLink(c, trackingNumber);
    },
    async fetch(trackingNumber: string): Promise<NormalizedResult> {
      const carrier = forcedCarrier && forcedCarrier !== "unknown" ? forcedCarrier : detectCarrier(trackingNumber);
      // Config (from user Settings) wins; env is the fallback for self-hosted setups.
      const provider = (config?.provider ?? process.env.CUSTOMER_TRACKING_PROVIDER ?? "none").toLowerCase();
      const key = config?.apiKey ?? process.env.CUSTOMER_TRACKING_API_KEY ?? "";

      if (provider === "aftership" && key) {
        const r = await fetchAfterShip(trackingNumber, carrier, key);
        if (r.found) return r;
      } else if (provider === "trackingmore" && key) {
        const r = await fetchTrackingMore(trackingNumber, carrier, key);
        if (r.found) return r;
      }

      // No aggregator configured (or it had nothing yet): manual mode.
      // found=false keeps the worker from retrying aggressively, but the UI still
      // shows the number, detected carrier, and a working deep-link.
      return {
        ...emptyResult(false),
        carrierCode: carrier,
        carrierName: CARRIER_NAMES[carrier],
      };
    },
  };
}
