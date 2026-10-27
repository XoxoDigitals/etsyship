import { prisma } from "@/lib/db";
import { ok, handle, parseJson } from "@/lib/api";
import { requireUserId, assertOrderOwner } from "@/lib/session";
import { orderSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";
import { money } from "@/lib/money";
import { deepLinkFor } from "@/lib/tracking";

export const dynamic = "force-dynamic";

type Ctx = { params: { orderId: string } };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const userId = await requireUserId();
  await assertOrderOwner(params.orderId, userId);

  const order = await prisma.order.findUniqueOrThrow({
    where: { id: params.orderId },
    include: {
      items: true,
      purchases: {
        orderBy: { purchasedAt: "desc" },
        include: { supplierAccount: { select: { label: true, emailMasked: true } } },
      },
      shipments: {
        orderBy: { createdAt: "asc" },
        include: { events: { orderBy: { time: "desc" } } },
      },
      events: { orderBy: { createdAt: "desc" } },
      store: { select: { id: true, name: true, currency: true } },
    },
  });

  return ok({
    id: order.id,
    storeId: order.storeId,
    orderNumber: order.orderNumber,
    status: order.status,
    currency: order.currency,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    shippingAddress: order.shippingAddress,
    shippingCity: order.shippingCity,
    shippingState: order.shippingState,
    shippingZip: order.shippingZip,
    shippingCountry: order.shippingCountry,
    notes: order.notes,
    placedAt: order.placedAt.toISOString(),
    createdAt: order.createdAt.toISOString(),
    store: order.store,
    items: order.items.map((i) => ({
      id: i.id,
      listingId: i.listingId,
      variantId: i.variantId,
      title: i.title,
      variantName: i.variantName,
      quantity: i.quantity,
      sellingPrice: money(i.sellingPrice),
    })),
    purchases: order.purchases.map((p) => ({
      id: p.id,
      supplierAccountId: p.supplierAccountId,
      supplierAccount: p.supplierAccount,
      supplierOrderNo: p.supplierOrderNo,
      buyingPrice: money(p.buyingPrice),
      buyingCurrency: p.buyingCurrency,
      buyingPriceInOrderCurrency: p.buyingPriceInOrderCurrency == null ? null : money(p.buyingPriceInOrderCurrency),
      fxRateUsed: p.fxRateUsed == null ? null : Number(p.fxRateUsed),
      cainiaoTrackingNo: p.cainiaoTrackingNo,
      purchasedAt: p.purchasedAt.toISOString(),
    })),
    shipments: order.shipments.map((s) => ({
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
    })),
    events: order.events.map((e) => ({
      id: e.id,
      type: e.type,
      message: e.message,
      createdAt: e.createdAt.toISOString(),
    })),
  });
});

const patchSchema = orderSchema
  .omit({ items: true, storeId: true, orderNumber: true, currency: true })
  .partial();

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const userId = await requireUserId();
  await assertOrderOwner(params.orderId, userId);
  const input = patchSchema.parse(await parseJson(req));

  const updated = await prisma.order.update({
    where: { id: params.orderId },
    data: {
      ...(input.customerName !== undefined && { customerName: input.customerName }),
      ...(input.customerEmail !== undefined && { customerEmail: input.customerEmail || null }),
      ...(input.customerPhone !== undefined && { customerPhone: input.customerPhone || null }),
      ...(input.shippingAddress !== undefined && { shippingAddress: input.shippingAddress || null }),
      ...(input.shippingCity !== undefined && { shippingCity: input.shippingCity || null }),
      ...(input.shippingState !== undefined && { shippingState: input.shippingState || null }),
      ...(input.shippingZip !== undefined && { shippingZip: input.shippingZip || null }),
      ...(input.shippingCountry !== undefined && { shippingCountry: input.shippingCountry || null }),
      ...(input.notes !== undefined && { notes: input.notes || null }),
    },
  });
  await audit({ userId, action: "UPDATE", entity: "Order", entityId: updated.id });
  return ok({
    ...updated,
    placedAt: updated.placedAt.toISOString(),
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  });
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const userId = await requireUserId();
  await assertOrderOwner(params.orderId, userId);
  const order = await prisma.order.update({ where: { id: params.orderId }, data: { archived: true } });
  await audit({ userId, action: "ARCHIVE", entity: "Order", entityId: order.id });
  return ok({ id: order.id, archived: true });
});
