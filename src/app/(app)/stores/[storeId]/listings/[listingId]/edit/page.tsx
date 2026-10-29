import Link from "next/link";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertStoreOwner } from "@/lib/session";
import { money } from "@/lib/money";
import { ListingForm } from "@/components/listings/ListingForm";

export const dynamic = "force-dynamic";

export default async function EditListingPage({
  params,
}: {
  params: Promise<{ storeId: string; listingId: string }>;
}) {
  const { storeId: storeIdParam, listingId: listingIdParam } = await params;
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");

  const store = await assertStoreOwner(storeIdParam, userId);

  const listing = await prisma.listing.findUnique({
    where: { id: listingIdParam },
    include: {
      images: { orderBy: { position: "asc" } },
      variants: { orderBy: { position: "asc" } },
      suppliers: { where: { archived: false }, orderBy: [{ isDefault: "desc" }, { position: "asc" }] },
    },
  });
  if (!listing || listing.storeId !== store.id) notFound();

  const n = (v: unknown) => (v === null || v === undefined ? null : money(v));

  const initial = {
    id: listing.id,
    title: listing.title,
    description: listing.description,
    supplierUrl: listing.supplierUrl,
    supplierName: listing.supplierName,
    supplierPrice: n(listing.supplierPrice),
    supplierCurrency: listing.supplierCurrency,
    listedPrice: n(listing.listedPrice),
    status: listing.status,
    fetchStatus: listing.fetchStatus,
    images: listing.images.map((i) => i.url),
    variants: listing.variants.map((v) => ({
      id: v.id,
      name: v.name,
      sku: v.sku,
      imageUrl: v.imageUrl,
      supplierPrice: n(v.supplierPrice),
      listedPrice: n(v.listedPrice),
    })),
    suppliers: listing.suppliers.map((s) => ({
      id: s.id,
      name: s.name,
      url: s.url,
      unitPrice: n(s.unitPrice),
      currency: s.currency,
      shipDaysUS: s.shipDaysUS,
      shipDaysUK: s.shipDaysUK,
      notes: s.notes,
      isDefault: s.isDefault,
    })),
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/stores/${store.id}/listings`} className="text-sm text-slate-500 hover:text-slate-700">
          ← Listings
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Edit listing</h1>
      </div>
      <ListingForm storeId={store.id} storeCurrency={store.currency} initial={initial} />
    </div>
  );
}
