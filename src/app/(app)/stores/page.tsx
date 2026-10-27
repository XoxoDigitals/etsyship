import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { StoresClient } from "@/components/stores/StoresClient";

export const dynamic = "force-dynamic";

export default async function StoresPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");

  const stores = await prisma.store.findMany({
    where: { userId, archived: false },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { listings: true, orders: true } } },
  });

  // Decimal -> plain for client component
  const rows = stores.map((s) => ({ ...s, feePercent: Number(s.feePercent) }));
  return <StoresClient stores={rows as any} />;
}
