import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, handle, parseJson } from "@/lib/api";
import { requireUserId, assertStoreOwner } from "@/lib/session";
import { listingSchema } from "@/lib/validation";
import { money } from "@/lib/money";
import { mirrorDefaultSupplier } from "@/lib/listing-suppliers";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ listingId: string }> };

const num = (v: unknown) => (v === null || v === undefined ? null : money(v));

const include = {
  images: { orderBy: { position: "asc" } },
  variants: { orderBy: { position: "asc" } },
} satisfies Prisma.ListingInclude;

type ListingFull = Prisma.ListingGetPayload<{ include: typeof include }>;

function serialize(l: ListingFull) {
  return {
    ...l,
    supplierPrice: num(l.supplierPrice),
    listedPrice: num(l.listedPrice),
    variants: l.variants.map((v) => ({
      ...v,
      supplierPrice: num(v.supplierPrice),
      listedPrice: num(v.listedPrice),
    })),
  };
}

async function loadOwned(listingId: string, userId: string) {
  const listing = await prisma.listing.findUnique({ where: { id: listingId }, include });
  if (!listing) {
    const err = new Error("NOT_FOUND") as Error & { status?: number };
    err.status = 404;
    throw err;
  }
  await assertStoreOwner(listing.storeId, userId);
  return listing;
}

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const { listingId } = await params;
  const userId = await requireUserId();
  const listing = await loadOwned(listingId, userId);
  return ok(serialize(listing));
});

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const { listingId } = await params;
  const userId = await requireUserId();
  const existing = await loadOwned(listingId, userId);
  const body = await parseJson<Record<string, unknown>>(req);
  const input = listingSchema.partial().parse(body);

  const fs = body?.fetchStatus;
  const fetchStatus = fs === "OK" || fs === "PARTIAL" || fs === "FAILED" ? fs : undefined;

  const updated = await prisma.$transaction(async (tx) => {
    if (input.images !== undefined) {
      await tx.listingImage.deleteMany({ where: { listingId: existing.id } });
      if (input.images.length > 0) {
        await tx.listingImage.createMany({
          data: input.images.map((url, i) => ({
            listingId: existing.id,
            url,
            position: i,
            isPrimary: i === 0,
          })),
        });
      }
    }
    if (input.variants !== undefined) {
      await tx.listingVariant.deleteMany({ where: { listingId: existing.id } });
      if (input.variants.length > 0) {
        await tx.listingVariant.createMany({
          data: input.variants.map((v, i) => ({
            listingId: existing.id,
            name: v.name,
            sku: v.sku || null,
            imageUrl: v.imageUrl || null,
            supplierPrice: v.supplierPrice ?? null,
            listedPrice: v.listedPrice ?? null,
            position: i,
          })),
        });
      }
    }

    if (input.suppliers !== undefined) {
      const incoming = input.suppliers;
      let defIdx = incoming.findIndex((s) => s.isDefault);
      if (defIdx < 0) defIdx = 0;
      // Upsert by id (keeps SupplierPurchase links); delete any removed rows.
      const keepIds = incoming.filter((s) => s.id).map((s) => s.id as string);
      await tx.listingSupplier.deleteMany({
        where: { listingId: existing.id, ...(keepIds.length ? { id: { notIn: keepIds } } : {}) },
      });
      for (let i = 0; i < incoming.length; i++) {
        const s = incoming[i];
        const data = {
          name: s.name?.trim() || "AliExpress",
          url: (s.url as string | null)?.trim?.() || null,
          unitPrice: s.unitPrice ?? null,
          currency: s.currency,
          shipDaysUS: s.shipDaysUS ?? null,
          shipDaysUK: s.shipDaysUK ?? null,
          notes: s.notes?.trim() || null,
          isDefault: i === defIdx,
          position: i,
        };
        if (s.id) await tx.listingSupplier.update({ where: { id: s.id }, data });
        else await tx.listingSupplier.create({ data: { listingId: existing.id, ...data } });
      }
    }

    return tx.listing.update({
      where: { id: existing.id },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && { description: input.description || null }),
        ...(input.supplierUrl !== undefined && { supplierUrl: input.supplierUrl || null }),
        ...(input.supplierName !== undefined && { supplierName: input.supplierName?.trim() || "AliExpress" }),
        ...(input.supplierPrice !== undefined && { supplierPrice: input.supplierPrice }),
        ...(input.supplierCurrency !== undefined && { supplierCurrency: input.supplierCurrency }),
        ...(input.listedPrice !== undefined && { listedPrice: input.listedPrice }),
        ...(input.status !== undefined && { status: input.status }),
        ...(fetchStatus !== undefined && { fetchStatus }),
      },
      include,
    });
  });

  if (input.suppliers !== undefined) {
    await mirrorDefaultSupplier(existing.id);
    const fresh = await loadOwned(existing.id, userId);
    return ok(serialize(fresh));
  }
  return ok(serialize(updated));
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const { listingId } = await params;
  const userId = await requireUserId();
  const listing = await loadOwned(listingId, userId);
  // Soft-archive to preserve order history references.
  await prisma.listing.update({
    where: { id: listing.id },
    data: { archived: true, status: "ARCHIVED" },
  });
  return ok({ id: listing.id, archived: true });
});
