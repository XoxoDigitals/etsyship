import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertStoreOwner } from "@/lib/session";
import { money } from "@/lib/money";
import { Button } from "@/components/ui";
import { OrdersClient, type OrdersInitial } from "@/components/orders/OrdersClient";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function OrdersPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId: storeIdParam } = await params;
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");

  const store = await assertStoreOwner(storeIdParam, userId);

  const where = { storeId: store.id, archived: false };
  const [total, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      include: {
        items: true,
        shipments: { select: { kind: true, status: true, delivered: true } },
        _count: { select: { shipments: true } },
      },
    }),
  ]);

  const initial: OrdersInitial = {
    total,
    page: 1,
    pageSize: PAGE_SIZE,
    items: rows.map((o) => {
      const items = o.items.map((i) => ({
        id: i.id,
        title: i.title,
        variantName: i.variantName,
        quantity: i.quantity,
        sellingPrice: money(i.sellingPrice),
      }));
      return {
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        currency: o.currency,
        customerName: o.customerName,
        placedAt: o.placedAt.toISOString(),
        items,
        shipments: o.shipments,
        _count: o._count,
        revenue: money(items.reduce((s, i) => s + i.sellingPrice * i.quantity, 0)),
      };
    }),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Orders</h1>
          <p className="text-sm text-slate-500">{store.name}</p>
        </div>
        <Link href={`/stores/${store.id}/orders/new`}>
          <Button>+ Create order</Button>
        </Link>
      </div>
      <OrdersClient storeId={store.id} storeCurrency={store.currency} initial={initial} />
    </div>
  );
}
