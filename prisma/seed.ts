import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SEED_EMAIL || "admin@example.com").toLowerCase();
  const password = process.env.SEED_PASSWORD || "changeme123";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`User ${email} already exists — skipping seed.`);
    return;
  }

  const user = await prisma.user.create({
    data: {
      email,
      name: "Admin",
      passwordHash: await bcrypt.hash(password, 12),
      settings: { create: {} },
    },
  });

  const store = await prisma.store.create({
    data: {
      userId: user.id,
      name: "Demo Etsy Store",
      platform: "ETSY",
      currency: "USD",
      feePercent: 6.5,
    },
  });

  await prisma.listing.create({
    data: {
      storeId: store.id,
      title: "Minimalist Ceramic Mug",
      supplierName: "AliExpress",
      supplierPrice: 3.2,
      supplierCurrency: "USD",
      listedPrice: 18.99,
      status: "ACTIVE",
      fetchStatus: "FAILED",
      images: { create: [{ url: "https://picsum.photos/seed/mug/600", position: 0, isPrimary: true }] },
      variants: {
        create: [
          { name: "White", supplierPrice: 3.2, listedPrice: 18.99, position: 0 },
          { name: "Black", supplierPrice: 3.6, listedPrice: 19.99, position: 1 },
        ],
      },
    },
  });

  console.log("Seed complete.");
  console.log(`  Login: ${email}`);
  console.log(`  Password: ${password}`);
  console.log("  Change this password after first login (or set SEED_EMAIL/SEED_PASSWORD).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
