import type { Currency } from "@prisma/client";
import { Decimal, toDecimal } from "./money";
import { convert } from "./currency";

export interface OrderLike {
  currency: Currency;
  items: { quantity: number; sellingPrice: Decimal.Value }[];
  purchases: {
    buyingPrice: Decimal.Value;
    buyingCurrency: Currency;
    buyingPriceInOrderCurrency: Decimal.Value | null;
  }[];
  store: { feePercent: Decimal.Value };
}

export interface ProfitBreakdown {
  currency: Currency;
  revenue: number; // sum of item selling prices * qty
  cost: number; // supplier buying cost, in order currency
  fees: number; // marketplace/payment fees (store.feePercent of revenue)
  profit: number; // revenue - cost - fees
  margin: number; // profit / revenue (0..1), 0 if no revenue
}

/**
 * Compute profit for an order, in the order's selling currency.
 * Uses the stored FX snapshot (buyingPriceInOrderCurrency) when present;
 * otherwise converts live. Synchronous path is preferred for analytics speed.
 */
export async function computeProfit(order: OrderLike): Promise<ProfitBreakdown> {
  const revenue = order.items.reduce(
    (acc, it) => acc.plus(toDecimal(it.sellingPrice).times(it.quantity)),
    new Decimal(0)
  );

  let cost = new Decimal(0);
  for (const p of order.purchases) {
    if (p.buyingPriceInOrderCurrency != null) {
      cost = cost.plus(toDecimal(p.buyingPriceInOrderCurrency));
    } else if (p.buyingCurrency === order.currency) {
      cost = cost.plus(toDecimal(p.buyingPrice));
    } else {
      const { amount } = await convert(p.buyingPrice, p.buyingCurrency, order.currency);
      cost = cost.plus(amount);
    }
  }

  const fees = revenue.times(toDecimal(order.store.feePercent)).dividedBy(100);
  const profit = revenue.minus(cost).minus(fees);
  const margin = revenue.gt(0) ? profit.dividedBy(revenue).toNumber() : 0;

  return {
    currency: order.currency,
    revenue: revenue.toDecimalPlaces(2).toNumber(),
    cost: cost.toDecimalPlaces(2).toNumber(),
    fees: fees.toDecimalPlaces(2).toNumber(),
    profit: profit.toDecimalPlaces(2).toNumber(),
    margin,
  };
}
