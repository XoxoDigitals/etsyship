import { ok, fail, handle } from "@/lib/api";
import { requireUserId, assertStoreOwner } from "@/lib/session";
import { computeStoreAnalytics } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const userId = await requireUserId();
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get("storeId");
  if (!storeId) return fail("storeId is required", 400);
  await assertStoreOwner(storeId, userId);

  const daysParam = searchParams.get("days");
  const parsed = daysParam ? Number(daysParam) : undefined;
  const days = parsed !== undefined && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;

  return ok(await computeStoreAnalytics(storeId, { days }));
});
