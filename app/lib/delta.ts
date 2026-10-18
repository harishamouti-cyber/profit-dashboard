import { D, type Decimal } from "./money";

export function periodDelta(current: Decimal, previous: Decimal): {
  text: string;
  tone: "success" | "critical" | "neutral";
} {
  if (D(previous).isZero()) {
    return D(current).isZero()
      ? { text: "0%", tone: "neutral" }
      : { text: "New", tone: "success" };
  }
  const pct = D(current).minus(previous).div(previous).times(100);
  const text = `${pct.gte(0) ? "+" : ""}${pct.toFixed(1)}%`;
  if (pct.gt(0)) return { text, tone: "success" };
  if (pct.lt(0)) return { text, tone: "critical" };
  return { text, tone: "neutral" };
}
