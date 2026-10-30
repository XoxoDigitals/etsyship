import { prisma } from "@/lib/db";
import { ok, handle, parseJson } from "@/lib/api";
import { requireUserId } from "@/lib/session";
import { storeSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const userId = await requireUserId();
  const stores = await prisma.store.findMany({
    where: { userId, archived: false },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { listings: true, orders: true } } },
  });
  return ok(stores);
});

export const POST = handle(async (req: Request) => {
  const userId = await requireUserId();
  const input = storeSchema.parse(await parseJson(req));
  const store = await prisma.store.create({
    data: {
      userId,
      name: input.name,
      platform: input.platform,
      storeType: input.storeType,
      currency: input.currency,
      feePercent: input.feePercent,
      notes: input.notes ?? null,
    },
  });
  await audit({ userId, action: "CREATE", entity: "Store", entityId: store.id });
  return ok(store, { status: 201 });
});
