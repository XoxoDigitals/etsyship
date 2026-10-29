import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { Currency } from "@prisma/client";
import { assertStoreOwner } from "@/lib/session";
import { money } from "@/lib/money";
import { getRate } from "@/lib/currency";
import { rankSuppliers } from "@/lib/suppliers";
import { deepLinkFor } from "@/lib/tracking";
import { OrderDetail, type OrderDetailData, type SupplierGroup } from "@/components/orders/OrderDetail";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: { params: Promise<{ storeId: string; orderId: string }> }) {
  const { storeId: storeIdParam, orderId: orderIdParam } = await params;
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");

  const store = await assertStoreOwner(storeIdParam, userId);

  const order = await prisma.order.findFirst({
    where: { id: orderIdParam, storeId: store.id },
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
    },
  });
  if (!order) notFound();

  const supplierAccounts = await prisma.supplierAccount.findMany({
    where: { storeId: store.id, archived: false },
    orderBy: { createdAt: "asc" },
    select: { id: true, label: true, emailMasked: true },
  });

  // Supplier sourcing options for the products in this order, ranked (price + US/UK speed).
  const listingIds = Array.from(
    new Set(order.items.map((i) => i.listingId).filter((v): v is string => !!v))
  );
  const listingsWithSuppliers = listingIds.length
    ? await prisma.listing.findMany({
        where: { id: { in: listingIds } },
        select: {
          id: true,
          title: true,
          suppliers: { where: { archived: false }, orderBy: [{ isDefault: "desc" }, { position: "asc" }] },
        },
      })
    : [];

  // Resolve FX rates (supplier currency → store currency) once each.
  const currencies = new Set<string>();
  for (const l of listingsWithSuppliers) for (const s of l.suppliers) currencies.add(s.currency);
  const rateMap = new Map<string, number>();
  for (const c of currencies) {
    const { rate } = await getRate(c as Currency, store.currency);
    rateMap.set(c, Number(rate));
  }

  const supplierGroups: SupplierGroup[] = listingsWithSuppliers
    .filter((l) => l.suppliers.length)
    .map((l) => ({
      listingId: l.id,
      listingTitle: l.title,
      suppliers: rankSuppliers(
        l.suppliers.map((s) => {
          const unit = s.unitPrice == null ? null : Number(s.unitPrice);
          const rate = rateMap.get(s.currency) ?? 1;
          return {
            id: s.id,
            name: s.name,
            url: s.url,
            unitPrice: unit,
            currency: s.currency,
            landedPrice: unit == null ? null : Math.round(unit * rate * 100) / 100,
            shipDaysUS: s.shipDaysUS,
            shipDaysUK: s.shipDaysUK,
          };
        })
      ),
    }));

  const data: OrderDetailData = {
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
  };

  return (
    <OrderDetail
      order={data}
      storeCurrency={store.currency}
      supplierAccounts={supplierAccounts}
      supplierGroups={supplierGroups}
    />
  );
}
