// Supplier ranking: pick the best sourcing option for an order.
//
// "Balanced" = combine landed price (already converted to the store currency by the caller)
// with shipping speed to the US/UK. The function is PURE — the caller resolves FX first and
// passes `landedPrice`, so this can run on the server or client with no async work.

export interface RankableSupplier {
  id: string;
  name: string;
  url: string | null;
  unitPrice: number | null; // in `currency`
  currency: string;
  landedPrice: number | null; // unitPrice converted to the store currency (caller-resolved)
  shipDaysUS: number | null;
  shipDaysUK: number | null;
}

export interface RankedSupplier extends RankableSupplier {
  avgDays: number | null; // mean of the defined US/UK estimates
  score: number | null; // 0 (best) .. 1 (worst); null when nothing to score
  recommended: boolean;
  cheapest: boolean;
  fastest: boolean;
}

function avgShipDays(s: RankableSupplier): number | null {
  const ds = [s.shipDaysUS, s.shipDaysUK].filter((d): d is number => typeof d === "number" && d >= 0);
  if (!ds.length) return null;
  return ds.reduce((a, b) => a + b, 0) / ds.length;
}

// Min-max normalize to 0..1 (lower is better). Missing values score 1 (worst).
function normalizer(values: number[]) {
  const defined = values.filter((v) => Number.isFinite(v));
  const min = defined.length ? Math.min(...defined) : 0;
  const max = defined.length ? Math.max(...defined) : 0;
  const span = max - min;
  return (v: number | null): number => {
    if (v === null || !Number.isFinite(v)) return 1;
    if (span === 0) return 0; // all equal → tie, treat as best
    return (v - min) / span;
  };
}

/** Rank suppliers best-first and tag recommended / cheapest / fastest. */
export function rankSuppliers(suppliers: RankableSupplier[]): RankedSupplier[] {
  if (suppliers.length === 0) return [];

  const withAvg = suppliers.map((s) => ({ ...s, avgDays: avgShipDays(s) }));

  const normPrice = normalizer(withAvg.map((s) => s.landedPrice ?? NaN));
  const normDays = normalizer(withAvg.map((s) => s.avgDays ?? NaN));

  // Identify cheapest / fastest ids (ignoring undefined dimensions).
  const pricedSorted = [...withAvg]
    .filter((s) => typeof s.landedPrice === "number")
    .sort((a, b) => (a.landedPrice as number) - (b.landedPrice as number));
  const fastSorted = [...withAvg]
    .filter((s) => typeof s.avgDays === "number")
    .sort((a, b) => (a.avgDays as number) - (b.avgDays as number));
  const cheapestId = pricedSorted[0]?.id;
  const fastestId = fastSorted[0]?.id;

  const scored = withAvg.map((s) => {
    const hasAny = s.landedPrice !== null || s.avgDays !== null;
    const score = hasAny ? 0.5 * normPrice(s.landedPrice) + 0.5 * normDays(s.avgDays) : null;
    return { ...s, score, recommended: false, cheapest: s.id === cheapestId, fastest: s.id === fastestId };
  });

  scored.sort((a, b) => {
    if (a.score === null && b.score === null) return 0;
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    if (a.score !== b.score) return a.score - b.score;
    // Tie-break by landed price (cheaper first), then fewer days.
    const ap = a.landedPrice ?? Infinity;
    const bp = b.landedPrice ?? Infinity;
    if (ap !== bp) return ap - bp;
    return (a.avgDays ?? Infinity) - (b.avgDays ?? Infinity);
  });

  if (scored.length && scored[0].score !== null) scored[0].recommended = true;
  return scored;
}
