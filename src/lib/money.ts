import { Decimal } from "decimal.js";
import type { Currency } from "@prisma/client";

export type CurrencyCode = "USD" | "GBP" | "EUR";

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  USD: "$",
  GBP: "£",
  EUR: "€",
};

export function toDecimal(v: unknown): Decimal {
  if (v === null || v === undefined || v === "") return new Decimal(0);
  // Prisma Decimal, number, or string all accepted
  return new Decimal(v as Decimal.Value);
}

export function money(v: unknown): number {
  return toDecimal(v).toDecimalPlaces(2).toNumber();
}

export function formatMoney(v: unknown, currency: Currency | CurrencyCode): string {
  const n = money(v);
  const symbol = CURRENCY_SYMBOLS[currency as CurrencyCode] ?? "";
  return `${symbol}${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export { Decimal };
