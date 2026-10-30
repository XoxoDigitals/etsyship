import type { CarrierCode } from "@/lib/tracking";
import { prisma } from "@/lib/db";
import { ok, fail, handle, parseJson } from "@/lib/api";
import { requireUserId, assertOrderOwner } from "@/lib/session";
import { audit, orderEvent } from "@/lib/audit";
import { shipmentStatusUpdateSchema } from "@/lib/validation";
import { deepLinkFor, detectCarrier, recomputeOrderStatusFromShipments, CARRIER_NAMES } from "@/lib/tracking";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  INFO_RECEIVED: "Info received",
  IN_TRANSIT: "In transit",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  EXCEPTION: "Exception",
  EXPIRED: "Expired",
  UNKNOWN: "Unknown",
};

// Manually set a shipment's status (for carriers with no live provider configured).
export const PATCH = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const userId = await requireUserId();
  const existing = await prisma.shipment.findUnique({ where: { id } });
  if (!existing) return fail("Not found", 404);
  await assertOrderOwner(existing.orderId, userId);

  const { status, note } = shipmentStatusUpdateSchema.parse(await parseJson(req));
  const delivered = status === "DELIVERED";
  const label = STATUS_LABELS[status] ?? status;
  const carrierCode = existing.carrierCode ?? detectCarrier(existing.trackingNumber);
  const carrierName = existing.carrierName ?? CARRIER_NAMES[carrierCode as CarrierCode] ?? null;

  await prisma.shipment.update({
    where: { id: existing.id },
    data: {
      status,
      statusDetail: note?.trim() || `${label} (set manually)`,
      delivered,
      carrierCode,
      carrierName,
      lastSyncedAt: new Date(),
      nextSyncAt: null, // manual status: stop automatic re-sync
      syncError: null,
    },
  });

  // Record the manual change on the shipment's own timeline.
  await prisma.trackingEvent.create({
    data: {
      shipmentId: existing.id,
      time: new Date(),
      status,
      location: null,
      description: note?.trim() ? `${label} — ${note.trim()}` : `${label} (set manually)`,
      hash: `manual-${Date.now()}`,
    },
  });

  // Recompute order status based on all supplier/customer shipments.
  await recomputeOrderStatusFromShipments(existing.orderId);

  await orderEvent(existing.orderId, "TRACKING_UPDATE", `${existing.kind} ${existing.trackingNumber} → ${label}`);
  await audit({
    userId,
    action: "UPDATE",
    entity: "Shipment",
    entityId: existing.id,
    meta: { orderId: existing.orderId, status },
  });

  const s = await prisma.shipment.findUniqueOrThrow({
    where: { id: existing.id },
    include: { events: { orderBy: { time: "desc" } } },
  });

  return ok({
    shipment: {
      id: s.id,
      orderId: s.orderId,
      kind: s.kind,
      trackingNumber: s.trackingNumber,
      carrierCode: s.carrierCode,
      carrierName: s.carrierName,
      status: s.status,
      statusDetail: s.statusDetail,
      estimatedDelivery: s.estimatedDelivery?.toISOString() ?? null,
      delivered: s.delivered,
      lastSyncedAt: s.lastSyncedAt?.toISOString() ?? null,
      syncError: s.syncError,
      deepLink: deepLinkFor(s.kind, s.trackingNumber, s.carrierCode),
      events: s.events.map((e) => ({
        id: e.id,
        time: e.time.toISOString(),
        status: e.status,
        location: e.location,
        description: e.description,
      })),
    },
  });
});

export const DELETE = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const userId = await requireUserId();
  const shipment = await prisma.shipment.findUnique({ where: { id } });
  if (!shipment) return fail("Not found", 404);
  await assertOrderOwner(shipment.orderId, userId);

  await prisma.shipment.delete({ where: { id: shipment.id } }); // events cascade
  await recomputeOrderStatusFromShipments(shipment.orderId);
  await audit({
    userId,
    action: "DELETE",
    entity: "Shipment",
    entityId: shipment.id,
    meta: { orderId: shipment.orderId, trackingNumber: shipment.trackingNumber },
  });
  return ok({ id: shipment.id, deleted: true });
});
