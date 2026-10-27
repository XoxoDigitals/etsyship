import type { OrderStatus } from "@prisma/client";
import { prisma } from "./db";
import { computeProfit } from "./profit";
import { money, toDecimal } from "./money";

export interface StoreAnalytics {
  currency: "USD" | "GBP" | "EUR";
  days: number;
  totals: {
    orderCount: number;
    revenue: number;
    cost: number;
    fees: number;
    profit: number;
    margin: number; // 0..1
    avgOrderValue: number;
    unitsSold: number;
  };
  statusCounts: Record<OrderStatus, number>;
  series: { date: string; revenue: number; profit: number; orders: number }[];
  topListings: { title: string; units: number; revenue: number; profit: number }[];
  shipments: { inTransit: number; delivered: number; exceptions: number; undelivered: number };
}

const ALL_STATUSES: OrderStatus[] = ["NEW", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"];
const IN_TRANSIT_STATUSES = ["IN_TRANSIT", "OUT_FOR_DELIVERY", "INFO_RECEIVED"];

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function computeStoreAnalytics(
  storeId: string,
  opts?: { days?: number }
): Promise<StoreAnalytics> {
  const rawDays = Number(opts?.days ?? 90);
  const days = Number.isFinite(rawDays) ? Math.min(Math.max(Math.floor(rawDays), 1), 730) : 90;

  const store = await prisma.store.findUniqueOrThrow({
    where: { id: storeId },
    select: { currency: true, feePercent: true },
  });

  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)));

  const [orders, shipmentGroups] = await Promise.all([
    prisma.order.findMany({
      where: { storeId, archived: false, placedAt: { gte: start } },
      select: {
        status: true,
        currency: true,
        placedAt: true,
        items: { select: { listingId: true, title: true, quantity: true, sellingPrice: true } },
        purchases: {
          select: { buyingPrice: true, buyingCurrency: true, buyingPriceInOrderCurrency: true },
        },
      },
    }),
    prisma.shipment.groupBy({
      by: ["status", "delivered"],
      where: { order: { storeId, archived: false } },
      _count: { _all: true },
    }),
  ]);

  const statusCounts = Object.fromEntries(ALL_STATUSES.map((s) => [s, 0])) as Record<OrderStatus, number>;

  // Continuous daily series (including zero days)
  const seriesMap = new Map<string, { date: string; revenue: number; profit: number; orders: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 86_400_000);
    const key = dayKey(d);
    seriesMap.set(key, { date: key, revenue: 0, profit: 0, orders: 0 });
  }

  let orderCount = 0;
  let revenue = 0;
  let cost = 0;
  let fees = 0;
  let profit = 0;
  let unitsSold = 0;
  const listingMap = new Map<string, { title: string; units: number; revenue: number; profit: number }>();

  for (const o of orders) {
    statusCounts[o.status] += 1;
    if (o.status === "CANCELLED" || o.status === "REFUNDED") continue;

    const p = await computeProfit({
      currency: o.currency,
      items: o.items,
      purchases: o.purchases,
      store: { feePercent: store.feePercent },
    });

    orderCount += 1;
    revenue += p.revenue;
    cost += p.cost;
    fees += p.fees;
    profit += p.profit;

    const point = seriesMap.get(dayKey(o.placedAt));
    if (point) {
      point.revenue += p.revenue;
      point.profit += p.profit;
      point.orders += 1;
    }

    for (const it of o.items) {
      const itemRevenue = toDecimal(it.sellingPrice).times(it.quantity).toNumber();
      const share = p.revenue > 0 ? itemRevenue / p.revenue : 0;
      const itemProfit = p.profit * share;
      unitsSold += it.quantity;

      const key = it.listingId ?? `t:${it.title}`;
      const cur = listingMap.get(key);
      if (cur) {
        cur.units += it.quantity;
        cur.revenue += itemRevenue;
        cur.profit += itemProfit;
      } else {
        listingMap.set(key, { title: it.title, units: it.quantity, revenue: itemRevenue, profit: itemProfit });
      }
    }
  }

  const topListings = Array.from(listingMap.values())
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 5)
    .map((l) => ({ title: l.title, units: l.units, revenue: money(l.revenue), profit: money(l.profit) }));

  const series = Array.from(seriesMap.values()).map((s) => ({
    date: s.date,
    revenue: round2(s.revenue),
    profit: round2(s.profit),
    orders: s.orders,
  }));

  let inTransit = 0;
  let delivered = 0;
  let exceptions = 0;
  let undelivered = 0;
  for (const g of shipmentGroups) {
    const n = g._count._all;
    const isDelivered = g.delivered || g.status === "DELIVERED";
    if (isDelivered) {
      delivered += n;
    } else {
      undelivered += n;
      if (IN_TRANSIT_STATUSES.includes(g.status)) inTransit += n;
    }
    if (g.status === "EXCEPTION") exceptions += n;
  }

  return {
    currency: store.currency,
    days,
    totals: {
      orderCount,
      revenue: round2(revenue),
      cost: round2(cost),
      fees: round2(fees),
      profit: round2(profit),
      margin: revenue > 0 ? profit / revenue : 0,
      avgOrderValue: orderCount > 0 ? round2(revenue / orderCount) : 0,
      unitsSold,
    },
    statusCounts,
    series,
    topListings,
    shipments: { inTransit, delivered, exceptions, undelivered },
  };
}
