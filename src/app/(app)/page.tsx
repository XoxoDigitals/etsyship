import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");

  const first = await prisma.store.findFirst({
    where: { userId, archived: false },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (first) redirect(`/stores/${first.id}`);
  redirect("/stores");
}
