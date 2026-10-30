import { prisma } from "@/lib/db";
import { ok, handle, parseJson } from "@/lib/api";
import { requireUserId, assertOrderOwner } from "@/lib/session";
import { shipmentSchema } from "@/lib/validation";
import { audit, orderEvent } from "@/lib/audit";
import { syncShipment, recomputeOrderStatusFromShipments, deepLinkFor, detectCarrier } from "@/lib/tracking";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request) => {
  const userId = await requireUserId();
  const body = shipmentSchema.parse(await parseJson(req));
  const order = await assertOrderOwner(body.orderId, userId);

  const trackingNumber = body.trackingNumber.trim();
  const requested = body.carrierCode?.trim().toLowerCase();
  const detected = detectCarrier(trackingNumber);
  const carrierCode =
    requested && requested !== "auto"
      ? requested
      : body.kind === "SUPPLIER"
        ? detected === "other"
          ? "cainiao"
          : detected
        : detected;

  const shipment = await prisma.shipment.upsert({
    where: { orderId_kind_trackingNumber: { orderId: order.id, kind: body.kind, trackingNumber } },
    create: { orderId: order.id, kind: body.kind, trackingNumber, carrierCode, nextSyncAt: new Date() },
    update: { carrierCode, nextSyncAt: new Date() },
  });

  // Customer tracking added -> order is on its way to the buyer.
  if (body.kind === "CUSTOMER" && (order.status === "NEW" || order.status === "PROCESSING")) {
    await prisma.order.update({ where: { id: order.id }, data: { status: "SHIPPED" } });
    await orderEvent(order.id, "STATUS_CHANGE", "Status → SHIPPED");
  }

  await syncShipment(shipment.id);
  await recomputeOrderStatusFromShipments(order.id);

  await orderEvent(order.id, "TRACKING_ADDED", `${body.kind} tracking ${trackingNumber}`);
  await audit({ userId, action: "CREATE", entity: "Shipment", entityId: shipment.id, meta: { orderId: order.id } });

  const fresh = await prisma.shipment.findUniqueOrThrow({
    where: { id: shipment.id },
    include: { events: { orderBy: { time: "desc" } } },
  });

  return ok(
    {
      ...fresh,
      estimatedDelivery: fresh.estimatedDelivery?.toISOString() ?? null,
      lastSyncedAt: fresh.lastSyncedAt?.toISOString() ?? null,
      nextSyncAt: fresh.nextSyncAt?.toISOString() ?? null,
      createdAt: fresh.createdAt.toISOString(),
      updatedAt: fresh.updatedAt.toISOString(),
      deepLink: deepLinkFor(fresh.kind, fresh.trackingNumber, fresh.carrierCode),
      events: fresh.events.map((e) => ({ ...e, time: e.time.toISOString() })),
    },
    { status: 201 }
  );
});
