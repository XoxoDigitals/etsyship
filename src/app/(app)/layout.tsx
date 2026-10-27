import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");

  const stores = await prisma.store.findMany({
    where: { userId, archived: false },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, platform: true, currency: true },
  });

  return (
    <AppShell stores={stores} userName={session?.user?.name || session?.user?.email}>
      {children}
    </AppShell>
  );
}
