import { prisma } from "@/lib/db";
import { ok, handle } from "@/lib/api";
import { requireUserId, assertStoreOwner } from "@/lib/session";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const DELETE = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const userId = await requireUserId();
  const account = await prisma.supplierAccount.findUnique({
    where: { id },
    include: { store: { select: { userId: true } } },
  });
  // Uniform 404 whether the id is missing or belongs to another tenant (no existence oracle).
  if (!account || account.store.userId !== userId) {
    const err = new Error("NOT_FOUND") as Error & { status?: number };
    err.status = 404;
    throw err;
  }
  await prisma.supplierAccount.update({ where: { id }, data: { archived: true } });
  await audit({ userId, action: "ARCHIVE", entity: "SupplierAccount", entityId: id });
  return ok({ id, archived: true });
});
