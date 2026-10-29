import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertStoreOwner } from "@/lib/session";
import { OrderForm, type FormListing } from "@/components/orders/OrderForm";

export const dynamic = "force-dynamic";

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export default async function NewOrderPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId: storeIdParam } = await params;
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");

  const store = await assertStoreOwner(storeIdParam, userId);

  const rows = await prisma.listing.findMany({
    where: { storeId: store.id, status: "ACTIVE", archived: false },
    orderBy: { title: "asc" },
    select: {
      id: true,
      title: true,
      listedPrice: true,
      supplierCurrency: true,
      images: {
        orderBy: [{ isPrimary: "desc" }, { position: "asc" }],
        take: 1,
        select: { url: true },
      },
      variants: {
        orderBy: { position: "asc" },
        select: { id: true, name: true, listedPrice: true, supplierPrice: true, imageUrl: true },
      },
    },
  });

  const listings: FormListing[] = rows.map((l) => ({
    id: l.id,
    title: l.title,
    listedPrice: num(l.listedPrice),
    supplierCurrency: l.supplierCurrency,
    imageUrl: l.images[0]?.url ?? null,
    variants: l.variants.map((v) => ({
      id: v.id,
      name: v.name,
      listedPrice: num(v.listedPrice),
      supplierPrice: num(v.supplierPrice),
      imageUrl: v.imageUrl ?? null,
    })),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Create order</h1>
        <p className="text-sm text-slate-500">{store.name}</p>
      </div>
      <OrderForm storeId={store.id} storeCurrency={store.currency} listings={listings} />
    </div>
  );
}
