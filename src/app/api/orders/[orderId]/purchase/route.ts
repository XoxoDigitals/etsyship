import { prisma } from "@/lib/db";
import { ok, fail, handle, parseJson } from "@/lib/api";
import { requireUserId, assertOrderOwner } from "@/lib/session";
import { supplierPurchaseSchema } from "@/lib/validation";
import { audit, orderEvent } from "@/lib/audit";
import { convert } from "@/lib/currency";
import { money } from "@/lib/money";
import { syncShipment, deepLinkFor } from "@/lib/tracking";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request, { params }: { params: Promise<{ orderId: string }> }) => {
  const { orderId } = await params;
  const userId = await requireUserId();
  const input = supplierPurchaseSchema.parse(await parseJson(req));
  const order = await assertOrderOwner(orderId, userId);

  if (input.supplierAccountId) {
    const acct = await prisma.supplierAccount.findUnique({
      where: { id: input.supplierAccountId },
      select: { storeId: true },
    });
    if (!acct || acct.storeId !== order.storeId) return fail("Supplier account does not belong to this store", 403);
  }

  if (input.listingSupplierId) {
    const ls = await prisma.listingSupplier.findUnique({
      where: { id: input.listingSupplierId },
      select: { listing: { select: { storeId: true } } },
    });
    if (!ls || ls.listing.storeId !== order.storeId) return fail("Supplier does not belong to this store", 403);
  }

  // FX snapshot at purchase time: buying currency -> order selling currency.
  let inOrder: string;
  let rate: string;
  let stale = false;
  if (input.buyingCurrency === order.currency) {
    inOrder = String(input.buyingPrice);
    rate = "1";
  } else {
    const c = await convert(input.buyingPrice, input.buyingCurrency, order.currency);
    // If no real rate was available (API down AND no cached rate), convert() falls back
    // to 1.0 with stale=true. Refuse rather than permanently store a wrong cost snapshot.
    if (c.stale && c.rate.equals(1)) {
      return fail(
        `Exchange rate ${input.buyingCurrency}→${order.currency} is temporarily unavailable. Please try again shortly.`,
        503
      );
    }
    inOrder = c.amount.toString();
    rate = c.rate.toString();
    stale = c.stale;
  }

  const tracking = input.cainiaoTrackingNo?.trim() || null;

  const purchase = await prisma.supplierPurchase.create({
    data: {
      orderId: order.id,
      supplierAccountId: input.supplierAccountId || null,
      listingSupplierId: input.listingSupplierId || null,
      supplierOrderNo: input.supplierOrderNo?.trim() || null,
      buyingPrice: input.buyingPrice,
      buyingCurrency: input.buyingCurrency,
      buyingPriceInOrderCurrency: inOrder,
      fxRateUsed: rate,
      cainiaoTrackingNo: tracking,
    },
    include: { supplierAccount: { select: { label: true, emailMasked: true } } },
  });

  let shipmentOut: unknown = null;
  if (tracking) {
    const shipment = await prisma.shipment.upsert({
      where: { orderId_kind_trackingNumber: { orderId: order.id, kind: "SUPPLIER", trackingNumber: tracking } },
      create: {
        orderId: order.id,
        kind: "SUPPLIER",
        trackingNumber: tracking,
        carrierCode: "cainiao",
        nextSyncAt: new Date(),
      },
      update: { nextSyncAt: new Date() },
    });
    await syncShipment(shipment.id);
    const fresh = await prisma.shipment.findUniqueOrThrow({
      where: { id: shipment.id },
      include: { events: { orderBy: { time: "desc" } } },
    });
    shipmentOut = {
      ...fresh,
      estimatedDelivery: fresh.estimatedDelivery?.toISOString() ?? null,
      lastSyncedAt: fresh.lastSyncedAt?.toISOString() ?? null,
      nextSyncAt: fresh.nextSyncAt?.toISOString() ?? null,
      createdAt: fresh.createdAt.toISOString(),
      updatedAt: fresh.updatedAt.toISOString(),
      deepLink: deepLinkFor(fresh.kind, fresh.trackingNumber, fresh.carrierCode),
      events: fresh.events.map((e) => ({ ...e, time: e.time.toISOString() })),
    };
  }

  if (input.markProcessing && order.status === "NEW") {
    await prisma.order.update({ where: { id: order.id }, data: { status: "PROCESSING" } });
    await orderEvent(order.id, "STATUS_CHANGE", "Status → PROCESSING");
  }

  const priceMsg =
    input.buyingCurrency === order.currency
      ? `${input.buyingPrice} ${input.buyingCurrency}`
      : `${input.buyingPrice} ${input.buyingCurrency} (≈ ${inOrder} ${order.currency} @ ${rate}${stale ? ", stale rate" : ""})`;
  await orderEvent(order.id, "PURCHASE_ADDED", `Supplier purchase added: ${priceMsg}`);
  if (tracking) await orderEvent(order.id, "TRACKING_ADDED", `SUPPLIER tracking ${tracking}`);
  await audit({ userId, action: "CREATE", entity: "SupplierPurchase", entityId: purchase.id, meta: { orderId: order.id } });

  return ok(
    {
      purchase: {
        id: purchase.id,
        orderId: purchase.orderId,
        supplierAccountId: purchase.supplierAccountId,
        supplierAccount: purchase.supplierAccount,
        supplierOrderNo: purchase.supplierOrderNo,
        buyingPrice: money(purchase.buyingPrice),
        buyingCurrency: purchase.buyingCurrency,
        buyingPriceInOrderCurrency:
          purchase.buyingPriceInOrderCurrency == null ? null : money(purchase.buyingPriceInOrderCurrency),
        fxRateUsed: purchase.fxRateUsed == null ? null : Number(purchase.fxRateUsed),
        cainiaoTrackingNo: purchase.cainiaoTrackingNo,
        purchasedAt: purchase.purchasedAt.toISOString(),
      },
      shipment: shipmentOut,
      fxStale: stale,
    },
    { status: 201 }
  );
});
