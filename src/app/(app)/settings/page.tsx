import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SettingsClient } from "@/components/settings/SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");

  const stores = await prisma.store.findMany({
    where: { userId, archived: false },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, currency: true },
  });

  return <SettingsClient stores={stores} />;
}
