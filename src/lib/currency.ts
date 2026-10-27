import { Currency } from "@prisma/client";
import { prisma } from "./db";
import { Decimal, toDecimal } from "./money";

// Free, keyless FX via Frankfurter (ECB reference rates). Rates are cached per-day in FxRate.
const FX_BASE = process.env.FX_API_BASE || "https://api.frankfurter.app";

function todayUTC(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

/**
 * Returns the conversion rate `from -> to` (how many `to` per 1 `from`).
 * Uses a daily DB cache; falls back to the Frankfurter API; final fallback is 1.0 with a flag.
 */
export async function getRate(
  from: Currency,
  to: Currency,
  asOf: Date = todayUTC()
): Promise<{ rate: Decimal; stale: boolean }> {
  if (from === to) return { rate: new Decimal(1), stale: false };

  const day = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()));

  const cached = await prisma.fxRate.findUnique({
    where: { base_quote_asOf: { base: from, quote: to, asOf: day } },
  });
  if (cached) return { rate: toDecimal(cached.rate), stale: false };

  try {
    const url = `${FX_BASE}/latest?from=${from}&to=${to}`;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`FX HTTP ${res.status}`);
    const data = (await res.json()) as { rates?: Record<string, number>; date?: string };
    const raw = data.rates?.[to];
    if (typeof raw !== "number") throw new Error("FX rate missing in response");
    const rate = new Decimal(raw);

    await prisma.fxRate
      .upsert({
        where: { base_quote_asOf: { base: from, quote: to, asOf: day } },
        update: { rate: rate.toString() },
        create: { base: from, quote: to, rate: rate.toString(), asOf: day },
      })
      .catch(() => void 0);

    return { rate, stale: false };
  } catch {
    // Last-resort: most recent cached rate for this pair, else 1.0
    const last = await prisma.fxRate.findFirst({
      where: { base: from, quote: to },
      orderBy: { asOf: "desc" },
    });
    if (last) return { rate: toDecimal(last.rate), stale: true };
    return { rate: new Decimal(1), stale: true };
  }
}

/** Convert an amount from one currency to another, returning a 2dp Decimal + the rate used. */
export async function convert(
  amount: Decimal.Value,
  from: Currency,
  to: Currency,
  asOf?: Date
): Promise<{ amount: Decimal; rate: Decimal; stale: boolean }> {
  const { rate, stale } = await getRate(from, to, asOf);
  const converted = toDecimal(amount).times(rate).toDecimalPlaces(2);
  return { amount: converted, rate, stale };
}
