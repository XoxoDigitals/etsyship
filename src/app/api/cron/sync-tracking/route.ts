import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { syncDueShipments } from "@/lib/tracking";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// External-cron alternative to the long-running worker.
// Requires CRON_SECRET to be set; call with `Authorization: Bearer <secret>`.
// Fails CLOSED: if the secret is not configured, the endpoint is disabled.
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return fail("Cron endpoint disabled: set CRON_SECRET to enable it", 503);
  const auth = req.headers.get("authorization") || "";
  if (auth !== `Bearer ${secret}`) return fail("Unauthorized", 401);
  const result = await syncDueShipments();
  return ok(result);
}
