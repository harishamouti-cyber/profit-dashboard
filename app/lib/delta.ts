import { D, type Decimal } from "./money";

/**
 * Period-over-period change. Divides by |previous| so the sign always follows the
 * direction of the move, even when the previous period was negative (a loss).
 * Crossing from zero or a loss into positive gets a label instead of a meaningless
 * huge percentage. `tone` is the direction: success = went up, critical = went down.
 */
export function periodDelta(current: Decimal, previous: Decimal): {
  text: string;
  tone: "success" | "critical" | "neutral";
} {
  const curr = D(current);
  const prev = D(previous);
  if (prev.isZero()) {
    if (curr.isZero()) return { text: "0%", tone: "neutral" };
    return { text: "New", tone: curr.gt(0) ? "success" : "critical" };
  }
  if (prev.lt(0) && curr.gt(0)) return { text: "Turned positive", tone: "success" };
  const pct = curr.minus(prev).div(prev.abs()).times(100);
  const text = `${pct.gte(0) ? "+" : ""}${pct.toFixed(1)}%`;
  if (pct.gt(0)) return { text, tone: "success" };
  if (pct.lt(0)) return { text, tone: "critical" };
  return { text, tone: "neutral" };
}
