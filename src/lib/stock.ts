import type { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "./db";

export interface StockLineItem {
  listingId?: string | null;
  variantId?: string | null;
  quantity: number;
}

export function isOrderStockActive(status: OrderStatus | string): boolean {
  return status !== "CANCELLED" && status !== "REFUNDED";
}

/**
 * Adjusts stockQuantity on ListingVariant (if variantId is set and has stockQuantity !== null)
 * or on Listing (if listing.stockQuantity !== null).
 *
 * @param items Line items to adjust
 * @param multiplier -1 to deduct stock (order placed), +1 to restore stock (order cancelled/refunded/deleted)
 */
export async function adjustInventoryForItems(
  items: StockLineItem[],
  multiplier: 1 | -1,
  tx: Prisma.TransactionClient = prisma
): Promise<void> {
  for (const item of items) {
    const qty = Math.max(0, Math.floor(Number(item.quantity) || 0));
    if (qty <= 0) continue;
    const delta = qty * multiplier;

    if (item.variantId) {
      const variant = await tx.listingVariant.findUnique({
        where: { id: item.variantId },
        select: { id: true, stockQuantity: true, listingId: true },
      });
      if (variant && variant.stockQuantity !== null) {
        const nextStock = Math.max(0, variant.stockQuantity + delta);
        await tx.listingVariant.update({
          where: { id: variant.id },
          data: { stockQuantity: nextStock },
        });
        continue;
      }
    }

    if (item.listingId) {
      const listing = await tx.listing.findUnique({
        where: { id: item.listingId },
        select: { id: true, stockQuantity: true },
      });
      if (listing && listing.stockQuantity !== null) {
        const nextStock = Math.max(0, listing.stockQuantity + delta);
        await tx.listing.update({
          where: { id: listing.id },
          data: { stockQuantity: nextStock },
        });
      }
    }
  }
}

