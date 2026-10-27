-- AlterTable
ALTER TABLE "SupplierPurchase" ADD COLUMN     "listingSupplierId" TEXT;

-- CreateTable
CREATE TABLE "ListingSupplier" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'AliExpress',
    "url" TEXT,
    "unitPrice" DECIMAL(12,2),
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "shipDaysUS" INTEGER,
    "shipDaysUK" INTEGER,
    "notes" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListingSupplier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ListingSupplier_listingId_idx" ON "ListingSupplier"("listingId");

-- AddForeignKey
ALTER TABLE "ListingSupplier" ADD CONSTRAINT "ListingSupplier_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPurchase" ADD CONSTRAINT "SupplierPurchase_listingSupplierId_fkey" FOREIGN KEY ("listingSupplierId") REFERENCES "ListingSupplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
