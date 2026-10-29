import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { UsersClient } from "@/components/users/UsersClient";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await getServerSession(authOptions);
  const currentUserId = (session?.user as { id?: string } | undefined)?.id;
  if (!currentUserId) redirect("/login");

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      stores: {
        where: { archived: false },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, platform: true, currency: true },
      },
      _count: {
        select: { stores: { where: { archived: false } } },
      },
    },
  });

  const rows = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    createdAt: u.createdAt.toISOString(),
    stores: u.stores,
    storeCount: u._count.stores,
  }));

  return <UsersClient initialUsers={rows} currentUserId={currentUserId} />;
}

