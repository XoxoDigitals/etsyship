import "dotenv/config";
import cron from "node-cron";
import { syncDueShipments } from "../src/lib/tracking";

const SCHEDULE = process.env.TRACKING_CRON || "0 */6 * * *"; // every 6 hours

async function runOnce(label: string) {
  const started = Date.now();
  try {
    const { processed, errors } = await syncDueShipments();
    console.log(
      `[tracking] ${label}: synced ${processed} shipment(s), ${errors} error(s) in ${Date.now() - started}ms`
    );
  } catch (e) {
    console.error("[tracking] run failed:", e);
  }
}

if (!cron.validate(SCHEDULE)) {
  console.error(`Invalid TRACKING_CRON expression: "${SCHEDULE}"`);
  process.exit(1);
}

console.log(`[tracking] worker started. schedule="${SCHEDULE}"`);
// Run once shortly after boot so a freshly-started worker catches up.
setTimeout(() => void runOnce("startup"), 5000);

cron.schedule(SCHEDULE, () => void runOnce("scheduled"));

// Keep process alive & handle shutdown.
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
