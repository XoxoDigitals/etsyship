import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertStoreOwner } from "@/lib/session";
import { money, formatMoney } from "@/lib/money";
import { computeStoreAnalytics } from "@/lib/analytics";
import { Badge, Card, CardBody, CardHeader, EmptyState, Stat } from "@/components/ui";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const linkPrimary =
  "inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700";
const linkSecondary =
  "inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50";

export default async function StoreDashboardPage({ params }: { params: { storeId: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");

  const store = await assertStoreOwner(params.storeId, userId);
  const storeId = store.id;

  const [a, recent, openOrders, orderTotal, listingTotal] = await Promise.all([
    computeStoreAnalytics(storeId, { days: 30 }),
    prisma.order.findMany({
      where: { storeId, archived: false },
      orderBy: { placedAt: "desc" },
      take: 8,
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        status: true,
        placedAt: true,
        currency: true,
        items: { select: { quantity: true, sellingPrice: true } },
      },
    }),
    prisma.order.count({
      where: { storeId, archived: false, status: { in: ["NEW", "PROCESSING", "SHIPPED"] } },
    }),
    prisma.order.count({ where: { storeId, archived: false } }),
    prisma.listing.count({ where: { storeId, archived: false } }),
  ]);

  const recentOrders = recent.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    customerName: o.customerName,
    status: o.status,
    placedAt: o.placedAt,
    currency: o.currency,
    total: money(o.items.reduce((acc, it) => acc + money(it.sellingPrice) * it.quantity, 0)),
  }));

  const cur = a.currency;
  const base = `/stores/${storeId}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{store.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {store.platform} · {store.currency} · Last 30 days
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`${base}/listings`} className={linkSecondary}>
            Listings
          </Link>
          <Link href={`${base}/orders`} className={linkSecondary}>
            Orders
          </Link>
          <Link href={`${base}/analytics`} className={linkPrimary}>
            Analytics
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Open orders" value={openOrders} sub="New, processing or shipped" />
        <Stat
          label="Parcels in transit"
          value={a.shipments.inTransit}
          sub={`${a.shipments.undelivered} undelivered${
            a.shipments.exceptions > 0 ? ` · ${a.shipments.exceptions} exception${a.shipments.exceptions === 1 ? "" : "s"}` : ""
          }`}
        />
        <Stat
          label="Revenue (30 days)"
          value={formatMoney(a.totals.revenue, cur)}
          sub={`${a.totals.orderCount} order${a.totals.orderCount === 1 ? "" : "s"}`}
        />
        <Stat
          label="Profit (30 days)"
          value={formatMoney(a.totals.profit, cur)}
          sub={`${(a.totals.margin * 100).toFixed(1)}% margin`}
        />
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Recent orders</h2>
          {orderTotal > 0 && (
            <Link href={`${base}/orders`} className="text-sm font-medium text-brand-600 hover:text-brand-700">
              View all
            </Link>
          )}
        </CardHeader>
        {recentOrders.length === 0 ? (
          <CardBody>
            <EmptyState
              title={listingTotal === 0 ? "Your store is empty" : "No orders yet"}
              desc={
                listingTotal === 0
                  ? "Add your first listing, then record orders as they come in."
                  : "Record your first order to start tracking profit and shipments."
              }
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  {listingTotal === 0 && (
                    <Link href={`${base}/listings/new`} className={linkPrimary}>
                      + Add listing
                    </Link>
                  )}
                  <Link href={`${base}/orders/new`} className={listingTotal === 0 ? linkSecondary : linkPrimary}>
                    + Add order
                  </Link>
                </div>
              }
            />
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-medium">Order</th>
                  <th className="px-5 py-3 font-medium">Customer</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Placed</th>
                  <th className="px-5 py-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentOrders.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <Link href={`${base}/orders/${o.id}`} className="font-medium text-brand-600 hover:text-brand-700">
                        {o.orderNumber}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-slate-700">{o.customerName}</td>
                    <td className="px-5 py-3">
                      <Badge status={o.status} />
                    </td>
                    <td className="px-5 py-3 text-slate-500">{fmtDate(o.placedAt)}</td>
                    <td className="px-5 py-3 text-right font-medium text-slate-900">
                      {formatMoney(o.total, o.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
