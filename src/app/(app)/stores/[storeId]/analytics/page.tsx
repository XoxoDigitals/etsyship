import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { assertStoreOwner } from "@/lib/session";
import { AnalyticsClient } from "@/components/analytics/AnalyticsClient";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage({ params }: { params: { storeId: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");

  const store = await assertStoreOwner(params.storeId, userId);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/stores/${store.id}`} className="text-sm text-slate-500 hover:text-slate-700">
          ← {store.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Analytics</h1>
      </div>
      <AnalyticsClient storeId={store.id} currency={store.currency} />
    </div>
  );
}
