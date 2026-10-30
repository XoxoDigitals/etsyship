import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { assertStoreOwner } from "@/lib/session";
import { ListingForm } from "@/components/listings/ListingForm";

export const dynamic = "force-dynamic";

export default async function NewListingPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId: storeIdParam } = await params;
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");

  const store = await assertStoreOwner(storeIdParam, userId);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/stores/${store.id}/listings`} className="text-sm text-slate-500 hover:text-slate-700">
          ← Listings
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Add listing</h1>
      </div>
      <ListingForm storeId={store.id} storeCurrency={store.currency} storeType={store.storeType} />
    </div>
  );
}
