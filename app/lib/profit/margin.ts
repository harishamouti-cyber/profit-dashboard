import { D, type Decimal } from "../money";

/** Product margin badge. Good at 40%+, watch at 15%+, otherwise low. */
export function marginTone(margin: Decimal | null): "success" | "warning" | "critical" | "neutral" {
  if (margin == null) return "neutral";
  if (D(margin).gte("0.4")) return "success";
  if (D(margin).gte("0.15")) return "warning";
  return "critical";
}

export function marginLabel(tone: ReturnType<typeof marginTone>): string {
  if (tone === "success") return "Good";
  if (tone === "warning") return "Watch";
  if (tone === "critical") return "Low";
  return "—";
}
