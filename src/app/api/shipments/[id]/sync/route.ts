import { prisma } from "@/lib/db";
import { ok, fail, handle } from "@/lib/api";
import { requireUserId, assertOrderOwner } from "@/lib/session";
import { syncShipment, deepLinkFor } from "@/lib/tracking";

export const dynamic = "force-dynamic";

export const POST = handle(async (_req: Request, { params }: { params: { id: string } }) => {
  const userId = await requireUserId();
  const existing = await prisma.shipment.findUnique({ where: { id: params.id } });
  if (!existing) return fail("Not found", 404);
  await assertOrderOwner(existing.orderId, userId);

  const outcome = await syncShipment(existing.id);

  const s = await prisma.shipment.findUniqueOrThrow({
    where: { id: existing.id },
    include: { events: { orderBy: { time: "desc" } } },
  });

  return ok({
    outcome,
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
