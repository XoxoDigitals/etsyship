import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertStoreOwner } from "@/lib/session";
import { money } from "@/lib/money";
import { ListingsClient } from "@/components/listings/ListingsClient";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function ListingsPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId: storeIdParam } = await params;
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");

  const store = await assertStoreOwner(storeIdParam, userId);

  const where = { storeId: store.id, archived: false };
  const [total, rows] = await Promise.all([
    prisma.listing.count({ where }),
    prisma.listing.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      include: {
        images: { orderBy: { position: "asc" } },
        _count: { select: { variants: true } },
      },
    }),
  ]);

  const items = rows.map((l) => ({
    id: l.id,
    title: l.title,
    status: l.status,
    supplierCurrency: l.supplierCurrency,
    supplierPrice: l.supplierPrice === null ? null : money(l.supplierPrice),
    listedPrice: l.listedPrice === null ? null : money(l.listedPrice),
    images: l.images.map((i) => ({ id: i.id, url: i.url, isPrimary: i.isPrimary })),
    _count: { variants: l._count.variants },
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/stores/${store.id}`} className="text-sm text-slate-500 hover:text-slate-700">
            ← {store.name}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Listings</h1>
        </div>
        <Link
          href={`/stores/${store.id}/listings/new`}
          className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
        >
          + Add listing
        </Link>
      </div>
      <ListingsClient
        storeId={store.id}
        storeCurrency={store.currency}
        initial={{ items, total, page: 1, pageSize: PAGE_SIZE }}
      />
    </div>
  );
}
