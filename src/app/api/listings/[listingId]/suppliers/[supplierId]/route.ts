import { prisma } from "@/lib/db";
import { ok, fail, handle, parseJson } from "@/lib/api";
import { requireUserId } from "@/lib/session";
import { listingSupplierSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";
import { assertListingOwner, serializeSupplier, mirrorDefaultSupplier } from "@/lib/listing-suppliers";

export const dynamic = "force-dynamic";

type Params = { params: { listingId: string; supplierId: string } };

export const PATCH = handle(async (req: Request, { params }: Params) => {
  const userId = await requireUserId();
  await assertListingOwner(params.listingId, userId);
  const existing = await prisma.listingSupplier.findUnique({ where: { id: params.supplierId } });
  if (!existing || existing.listingId !== params.listingId) return fail("Not found", 404);

  const input = listingSupplierSchema.partial().parse(await parseJson(req));

  if (input.isDefault) {
    await prisma.listingSupplier.updateMany({
      where: { listingId: params.listingId },
      data: { isDefault: false },
    });
  }

  const updated = await prisma.listingSupplier.update({
    where: { id: params.supplierId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.url !== undefined ? { url: input.url?.trim() || null } : {}),
      ...(input.unitPrice !== undefined ? { unitPrice: input.unitPrice ?? null } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.shipDaysUS !== undefined ? { shipDaysUS: input.shipDaysUS ?? null } : {}),
      ...(input.shipDaysUK !== undefined ? { shipDaysUK: input.shipDaysUK ?? null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
      ...(input.isDefault !== undefined ? { isDefault: Boolean(input.isDefault) } : {}),
    },
  });

  await mirrorDefaultSupplier(params.listingId);
  await audit({ userId, action: "UPDATE", entity: "ListingSupplier", entityId: updated.id });
  return ok({ supplier: serializeSupplier(updated) });
});

export const DELETE = handle(async (_req: Request, { params }: Params) => {
  const userId = await requireUserId();
  await assertListingOwner(params.listingId, userId);
  const existing = await prisma.listingSupplier.findUnique({ where: { id: params.supplierId } });
  if (!existing || existing.listingId !== params.listingId) return fail("Not found", 404);

  await prisma.listingSupplier.delete({ where: { id: params.supplierId } });

  // If we removed the default, promote the next remaining supplier.
  if (existing.isDefault) {
    const next = await prisma.listingSupplier.findFirst({
      where: { listingId: params.listingId, archived: false },
      orderBy: { position: "asc" },
    });
    if (next) await prisma.listingSupplier.update({ where: { id: next.id }, data: { isDefault: true } });
  }
  await mirrorDefaultSupplier(params.listingId);
  await audit({ userId, action: "DELETE", entity: "ListingSupplier", entityId: params.supplierId });
  return ok({ id: params.supplierId, deleted: true });
});
