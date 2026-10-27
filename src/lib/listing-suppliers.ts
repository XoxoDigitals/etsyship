import type { ListingSupplier } from "@prisma/client";
import { prisma } from "./db";
import { assertStoreOwner } from "./session";

/** Resolve a listing's store and assert the current user owns it. Returns the listing. */
export async function assertListingOwner(listingId: string, userId: string) {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { id: true, storeId: true },
  });
  if (!listing) {
    const err = new Error("NOT_FOUND") as Error & { status?: number };
    err.status = 404;
    throw err;
  }
  await assertStoreOwner(listing.storeId, userId);
  return listing;
}

export function serializeSupplier(s: ListingSupplier) {
  return {
    id: s.id,
    name: s.name,
    url: s.url,
    unitPrice: s.unitPrice == null ? null : Number(s.unitPrice),
    currency: s.currency,
    shipDaysUS: s.shipDaysUS,
    shipDaysUK: s.shipDaysUK,
    notes: s.notes,
    isDefault: s.isDefault,
    position: s.position,
  };
}

/**
 * Keep the legacy Listing.supplier* columns in sync with the listing's default supplier,
 * so the profit preview, analytics, and order POS (which read those columns) stay correct.
 */
export async function mirrorDefaultSupplier(listingId: string) {
  const def = await prisma.listingSupplier.findFirst({
    where: { listingId, archived: false },
    orderBy: [{ isDefault: "desc" }, { position: "asc" }],
  });
  if (!def) return;
  await prisma.listing.update({
    where: { id: listingId },
    data: {
      supplierName: def.name,
      supplierUrl: def.url,
      supplierPrice: def.unitPrice,
      supplierCurrency: def.currency,
    },
  });
}
