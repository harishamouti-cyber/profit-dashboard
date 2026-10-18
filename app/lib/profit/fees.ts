import { D, sum, type Decimal } from "../money";

export type FeeMode = "ACTUAL_THEN_RULE" | "RULE_ONLY";

export interface FeeTransaction {
  kind: string;
  status: string;
  gateway?: string | null;
  amount: Decimal;
  fees: Decimal[];
}

export interface GatewayRule {
  gateway: string;
  percent: Decimal;
  fixed: Decimal;
}

export interface FeeResult {
  amount: Decimal;
  actual: boolean;
  warnings: string[];
}

export function normalizeGateway(gateway: string): string {
  return gateway.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function isSuccessfulCharge(tx: FeeTransaction): boolean {
  const kind = tx.kind.toUpperCase();
  return (kind === "SALE" || kind === "CAPTURE") && tx.status.toUpperCase() === "SUCCESS";
}

/**
 * ACTUAL_THEN_RULE: if any successful SALE/CAPTURE has fees, sum those fee amounts
 * and do not mix in gateway rules. Otherwise (or in RULE_ONLY) apply
 * amount * percent + fixed per successful charge. A missing rule is 0 plus a warning.
 */
export function paymentFees(
  transactions: FeeTransaction[],
  rules: GatewayRule[],
  mode: FeeMode,
): FeeResult {
  const charges = transactions.filter(isSuccessfulCharge);
  const warnings: string[] = [];

  if (mode === "ACTUAL_THEN_RULE" && charges.some((tx) => tx.fees.length > 0)) {
    return {
      amount: sum(charges.flatMap((tx) => tx.fees)),
      actual: true,
      warnings,
    };
  }

  const byGateway = new Map(rules.map((rule) => [normalizeGateway(rule.gateway), rule]));
  let amount = D(0);
  for (const tx of charges) {
    const key = normalizeGateway(tx.gateway ?? "");
    const rule = byGateway.get(key);
    if (!rule) {
      warnings.push(`No fee rule for gateway "${tx.gateway ?? ""}"`);
      continue;
    }
    amount = amount.plus(D(tx.amount).mul(D(rule.percent))).plus(D(rule.fixed));
  }
  return { amount, actual: false, warnings };
}

export function refundedFees(
  transactions: Array<{ kind: string; status: string; fees: Decimal[] }>,
): Decimal {
  const refunds = transactions.filter(
    (tx) => tx.kind.toUpperCase() === "REFUND" && tx.status.toUpperCase() === "SUCCESS",
  );
  return sum(refunds.flatMap((tx) => tx.fees));
}
