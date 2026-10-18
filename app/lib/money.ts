import { Decimal } from "decimal.js";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/** Parse a money value. Null, undefined, and blank become 0. Never use JS number math. */
export function D(value: Decimal.Value | null | undefined): Decimal {
  if (value == null || value === "") return new Decimal(0);
  if (typeof value === "object" && "toString" in value) {
    return new Decimal(value.toString());
  }
  return new Decimal(value);
}

export function sum(values: Array<Decimal.Value | null | undefined>): Decimal {
  return values.reduce<Decimal>((acc, value) => acc.plus(D(value)), new Decimal(0));
}

/** 4 decimal places, the precision stored in Postgres. */
export function toDb(value: Decimal.Value): string {
  return D(value).toFixed(4);
}

/** Display at 2 decimal places. Formatting only; calculations stay on Decimal. */
export function fmt(value: Decimal.Value, currency = "USD"): string {
  const fixed = D(value).toFixed(2);
  const negative = fixed.startsWith("-");
  const [whole, frac] = fixed.replace("-", "").split(".");
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (currency === "USD") {
    return `${negative ? "-" : ""}$${withCommas}.${frac}`;
  }
  return `${negative ? "-" : ""}${withCommas}.${frac} ${currency}`;
}

export function fmtRatio(value: Decimal | null): string {
  if (value == null) return "—";
  return `${value.times(100).toFixed(1)}%`;
}

export function fmtMultiple(value: Decimal | null): string {
  if (value == null) return "—";
  return `${value.toFixed(2)}×`;
}

/** Read MoneyBag.shopMoney.amount. Presentment money is intentionally ignored. */
export function shopAmount(bag: unknown): Decimal {
  if (!bag || typeof bag !== "object") return D(0);
  const shopMoney = (bag as { shopMoney?: { amount?: unknown } | null }).shopMoney;
  if (!shopMoney || shopMoney.amount == null) return D(0);
  return D(String(shopMoney.amount));
}

export function moneyAmount(node: unknown): Decimal {
  if (!node || typeof node !== "object") return D(0);
  const amount = (node as { amount?: unknown }).amount;
  if (amount == null) return D(0);
  return D(String(amount));
}

const MONEY = /^-?\d+(\.\d+)?$/;

/** True when a form value can be stored as Decimal(14,4). */
export function isMoney(value: string | null | undefined): value is string {
  return typeof value === "string" && MONEY.test(value.trim());
}

export type { Decimal };
