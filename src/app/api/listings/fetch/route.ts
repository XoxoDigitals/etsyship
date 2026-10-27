import { ok, handle, parseJson } from "@/lib/api";
import { requireUserId, assertStoreOwner } from "@/lib/session";
import { fetchListingSchema } from "@/lib/validation";
import { fetchAliExpress } from "@/lib/aliexpress";

export const dynamic = "force-dynamic";

// Best-effort scrape of a supplier URL. Does NOT save anything.
export const POST = handle(async (req: Request) => {
  const userId = await requireUserId();
  const input = fetchListingSchema.parse(await parseJson(req));
  await assertStoreOwner(input.storeId, userId);
  const result = await fetchAliExpress(input.url);
  return ok(result);
});
