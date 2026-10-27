// One-off: create a default ListingSupplier for every listing that has none,
// from the legacy Listing.supplier* fields. Safe to re-run (skips listings that already have one).
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const listings = await prisma.listing.findMany({
    where: { suppliers: { none: {} } },
    select: {
      id: true,
      supplierName: true,
      supplierUrl: true,
      supplierPrice: true,
      supplierCurrency: true,
    },
  });

  for (const l of listings) {
    await prisma.listingSupplier.create({
      data: {
        listingId: l.id,
        name: l.supplierName || "AliExpress",
        url: l.supplierUrl || null,
        unitPrice: l.supplierPrice ?? null,
        currency: l.supplierCurrency,
        isDefault: true,
        position: 0,
      },
    });
  }

  console.log(`Backfilled suppliers for ${listings.length} listing(s).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
