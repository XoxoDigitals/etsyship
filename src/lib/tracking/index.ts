import crypto from "crypto";
import { prisma } from "../db";
import { orderEvent } from "../audit";
import { cainiaoProvider } from "./cainiao";
import { makeCarrierProvider, detectCarrier, carrierDeepLink, CARRIER_NAMES, CarrierCode, type TrackingConfig } from "./carriers";
import type { NormalizedResult, TrackingProvider } from "./types";

export * from "./types";
export { cainiaoProvider } from "./cainiao";
export { makeCarrierProvider, detectCarrier, carrierDeepLink, CARRIER_NAMES } from "./carriers";
export type { CarrierCode } from "./carriers";

// Default re-sync interval (ms). Worker cron also enforces cadence; this decides nextSyncAt.
const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
// Stop auto-syncing a shipment that has never resolved after this age.
const MAX_AGE_MS = 120 * 24 * 60 * 60 * 1000;

function eventHash(time: Date, description: string): string {
  return crypto.createHash("sha1").update(`${time.toISOString()}|${description}`).digest("hex");
}

export function providerFor(
  kind: "SUPPLIER" | "CUSTOMER",
  carrierCode?: string | null,
  config?: TrackingConfig
): TrackingProvider {
  const hint = (carrierCode as CarrierCode) || undefined;
  if (kind === "SUPPLIER") {
    if (hint && hint !== "cainiao" && hint !== "other") {
      return makeCarrierProvider(hint, config);
    }
    return {
      code: "cainiao",
      deepLink: (tn) => {
        const detected = detectCarrier(tn, hint);
        if (detected !== "other" && detected !== "cainiao") return carrierDeepLink(tn, detected);
        return cainiaoProvider.deepLink(tn);
      },
      async fetch(tn: string): Promise<NormalizedResult> {
        const detected = detectCarrier(tn, hint);
        if (detected === "ups" || detected === "usps" || detected === "fedex" || detected === "dhl") {
          const res = await makeCarrierProvider(detected, config).fetch(tn);
          if (res.found) return res;
        }
        const cn = await cainiaoProvider.fetch(tn);
        if (cn.found && cn.events.length > 0) return cn;
        return await makeCarrierProvider(detected === "other" ? undefined : detected, config).fetch(tn);
      },
    };
  }
  return makeCarrierProvider(hint, config);
}

/**
 * Resolve the customer-carrier tracking config for an order. Env wins (self-hosted);
 * otherwise the order owner's Settings (trackingProvider + trackingApiKey).
 */
async function trackingConfigForOrder(orderId: string): Promise<TrackingConfig> {
  const envProvider = (process.env.CUSTOMER_TRACKING_PROVIDER || "").toLowerCase();
  const envKey = process.env.CUSTOMER_TRACKING_API_KEY || "";
  if (envProvider && envProvider !== "none" && envKey) return { provider: envProvider, apiKey: envKey };

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { store: { select: { userId: true } } },
  });
  const userId = order?.store.userId;
  if (userId) {
    const setting = await prisma.setting.findUnique({ where: { userId } });
    const data = (setting?.data as { trackingProvider?: string; trackingApiKey?: string } | null) || {};
    const provider = (data.trackingProvider || "none").toLowerCase();
    const apiKey = data.trackingApiKey || "";
    if (provider !== "none" && apiKey) return { provider, apiKey };
  }
  return { provider: "none", apiKey: "" };
}

export function deepLinkFor(kind: "SUPPLIER" | "CUSTOMER", trackingNumber: string, carrierCode?: string | null): string {
  return providerFor(kind, carrierCode).deepLink(trackingNumber);
}

export interface SyncOutcome {
  ok: boolean;
  newEvents: number;
  status: NormalizedResult["status"];
  delivered: boolean;
  error?: string;
}

/** Fetch latest tracking for one shipment and persist events + status. Never throws. */
export async function syncShipment(shipmentId: string): Promise<SyncOutcome> {
  const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId } });
  if (!shipment) return { ok: false, newEvents: 0, status: "UNKNOWN", delivered: false, error: "not found" };

  const config = shipment.kind === "CUSTOMER" ? await trackingConfigForOrder(shipment.orderId) : undefined;
  const provider = providerFor(shipment.kind, shipment.carrierCode, config);
  let result: NormalizedResult;
  try {
    result = await provider.fetch(shipment.trackingNumber);
  } catch (e) {
    await prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        lastSyncedAt: new Date(),
        nextSyncAt: new Date(Date.now() + SYNC_INTERVAL_MS),
        syncError: e instanceof Error ? e.message : "fetch error",
      },
    });
    return { ok: false, newEvents: 0, status: shipment.status, delivered: shipment.delivered, error: "fetch error" };
  }

  // Persist events (dedup on [shipmentId, hash]).
  let newEvents = 0;
  if (result.events.length) {
    const rows = result.events.map((ev) => ({
      shipmentId,
      time: ev.time,
      status: ev.status,
      location: ev.location ?? null,
      description: ev.description,
      hash: eventHash(ev.time, ev.description),
    }));
    const res = await prisma.trackingEvent.createMany({ data: rows, skipDuplicates: true });
    newEvents = res.count;
  }

  const age = Date.now() - shipment.createdAt.getTime();
  const delivered = result.delivered;
  // Schedule next sync: stop when delivered, or when unresolved past MAX_AGE.
  const nextSyncAt =
    delivered || (!result.found && age > MAX_AGE_MS) ? null : new Date(Date.now() + SYNC_INTERVAL_MS);

  await prisma.shipment.update({
    where: { id: shipmentId },
    data: {
      status: result.found ? result.status : shipment.status,
      statusDetail: result.statusDetail ?? shipment.statusDetail,
      carrierCode: result.carrierCode ?? shipment.carrierCode,
      carrierName: result.carrierName ?? shipment.carrierName,
      estimatedDelivery: result.estimatedDelivery ?? shipment.estimatedDelivery,
      delivered,
      lastSyncedAt: new Date(),
      nextSyncAt,
      syncError: result.found ? null : shipment.syncError,
    },
  });

  // Mark order as DELIVERED when either SUPPLIER or CUSTOMER tracking is delivered.
  if (delivered && (shipment.kind === "CUSTOMER" || shipment.kind === "SUPPLIER")) {
    const res = await prisma.order
      .updateMany({
        where: { id: shipment.orderId, status: { in: ["NEW", "PROCESSING", "SHIPPED"] } },
        data: { status: "DELIVERED" },
      })
      .catch(() => ({ count: 0 }));
    if (res.count > 0) {
      await orderEvent(
        shipment.orderId,
        "STATUS_CHANGE",
        `Status → DELIVERED (${shipment.kind.toLowerCase()} tracking delivered)`
      ).catch(() => void 0);
    }
  }

  return { ok: true, newEvents, status: result.status, delivered };
}

/** Sync all shipments that are due (not delivered and nextSyncAt <= now). Used by the worker. */
export async function syncDueShipments(limit = 200): Promise<{ processed: number; errors: number }> {
  const due = await prisma.shipment.findMany({
    where: {
      delivered: false,
      OR: [{ nextSyncAt: null }, { nextSyncAt: { lte: new Date() } }],
    },
    orderBy: { nextSyncAt: "asc" },
    take: limit,
    select: { id: true },
  });

  let errors = 0;
  for (const s of due) {
    const out = await syncShipment(s.id);
    if (!out.ok) errors++;
    // small spacing to be polite to upstream
    await new Promise((r) => setTimeout(r, 400));
  }
  return { processed: due.length, errors };
}
