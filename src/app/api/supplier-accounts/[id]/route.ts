import { prisma } from "@/lib/db";
import { ok, handle } from "@/lib/api";
import { requireUserId, assertStoreOwner } from "@/lib/session";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const DELETE = handle(async (_req: Request, { params }: { params: { id: string } }) => {
  const userId = await requireUserId();
  const account = await prisma.supplierAccount.findUnique({
    where: { id: params.id },
    include: { store: { select: { userId: true } } },
  });
  // Uniform 404 whether the id is missing or belongs to another tenant (no existence oracle).
  if (!account || account.store.userId !== userId) {
    const err = new Error("NOT_FOUND") as Error & { status?: number };
    err.status = 404;
    throw err;
  }
  await prisma.supplierAccount.update({ where: { id: params.id }, data: { archived: true } });
  await audit({ userId, action: "ARCHIVE", entity: "SupplierAccount", entityId: params.id });
  return ok({ id: params.id, archived: true });
});
