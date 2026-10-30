import { prisma } from "@/lib/db";
import { ok, handle, parseJson } from "@/lib/api";
import { requireUserId, assertStoreOwner } from "@/lib/session";
import { storeSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const GET = handle(async (_req: Request, { params }: { params: Promise<{ storeId: string }> }) => {
  const { storeId } = await params;
  const userId = await requireUserId();
  const store = await assertStoreOwner(storeId, userId);
  return ok(store);
});

export const PATCH = handle(async (req: Request, { params }: { params: Promise<{ storeId: string }> }) => {
  const { storeId } = await params;
  const userId = await requireUserId();
  await assertStoreOwner(storeId, userId);
  const input = storeSchema.partial().parse(await parseJson(req));
  const store = await prisma.store.update({
    where: { id: storeId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.platform !== undefined && { platform: input.platform }),
      ...(input.storeType !== undefined && { storeType: input.storeType }),
      ...(input.currency !== undefined && { currency: input.currency }),
      ...(input.feePercent !== undefined && { feePercent: input.feePercent }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
  });
  await audit({ userId, action: "UPDATE", entity: "Store", entityId: store.id });
  return ok(store);
});

export const DELETE = handle(async (_req: Request, { params }: { params: Promise<{ storeId: string }> }) => {
  const { storeId } = await params;
  const userId = await requireUserId();
  await assertStoreOwner(storeId, userId);
  // Soft-delete (archive) to preserve order history.
  const store = await prisma.store.update({ where: { id: storeId }, data: { archived: true } });
  await audit({ userId, action: "ARCHIVE", entity: "Store", entityId: store.id });
  return ok({ id: store.id, archived: true });
});
