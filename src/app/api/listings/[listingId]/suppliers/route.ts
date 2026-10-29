import { prisma } from "@/lib/db";
import { ok, handle, parseJson } from "@/lib/api";
import { requireUserId } from "@/lib/session";
import { listingSupplierSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";
import { assertListingOwner, serializeSupplier, mirrorDefaultSupplier } from "@/lib/listing-suppliers";

export const dynamic = "force-dynamic";

export const GET = handle(async (_req: Request, { params }: { params: Promise<{ listingId: string }> }) => {
  const { listingId } = await params;
  const userId = await requireUserId();
  await assertListingOwner(listingId, userId);
  const rows = await prisma.listingSupplier.findMany({
    where: { listingId, archived: false },
    orderBy: [{ isDefault: "desc" }, { position: "asc" }],
  });
  return ok({ suppliers: rows.map(serializeSupplier) });
});

export const POST = handle(async (req: Request, { params }: { params: Promise<{ listingId: string }> }) => {
  const { listingId } = await params;
  const userId = await requireUserId();
  await assertListingOwner(listingId, userId);
  const input = listingSupplierSchema.parse(await parseJson(req));

  const count = await prisma.listingSupplier.count({
    where: { listingId, archived: false },
  });
  const makeDefault = Boolean(input.isDefault) || count === 0;
  if (makeDefault) {
    await prisma.listingSupplier.updateMany({
      where: { listingId },
      data: { isDefault: false },
    });
  }

  const created = await prisma.listingSupplier.create({
    data: {
      listingId,
      name: input.name,
      url: input.url?.trim() || null,
      unitPrice: input.unitPrice ?? null,
      currency: input.currency,
      shipDaysUS: input.shipDaysUS ?? null,
      shipDaysUK: input.shipDaysUK ?? null,
      notes: input.notes?.trim() || null,
      isDefault: makeDefault,
      position: count,
    },
  });

  if (makeDefault) await mirrorDefaultSupplier(listingId);
  await audit({
    userId,
    action: "CREATE",
    entity: "ListingSupplier",
    entityId: created.id,
    meta: { listingId },
  });
  return ok({ supplier: serializeSupplier(created) }, { status: 201 });
});
