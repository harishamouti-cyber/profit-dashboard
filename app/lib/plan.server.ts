import type { Plan } from "@prisma/client";
export { PLAN_PRICES, type BillingPlanName } from "./plan";

export const PLAN_ORDER: Plan[] = ["NONE", "STARTER", "GROWTH", "PRO"];

export interface PlanLimits {
  ordersPerMonth: number;
  expenses: number;
  productRows: number;
  csvImport: boolean;
  csvExport: boolean;
  adSpendCsv: boolean;
  shippingCsv: boolean;
  skuFallback: boolean;
  customGatewayRules: boolean;
  emailDigest: boolean;
  recalcHistory: boolean;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  NONE: {
    ordersPerMonth: 0,
    expenses: 0,
    productRows: 0,
    csvImport: false,
    csvExport: false,
    adSpendCsv: false,
    shippingCsv: false,
    skuFallback: false,
    customGatewayRules: false,
    emailDigest: false,
    recalcHistory: false,
  },
  STARTER: {
    ordersPerMonth: 300,
    expenses: 3,
    productRows: 10,
    csvImport: false,
    csvExport: false,
    adSpendCsv: false,
    shippingCsv: false,
    skuFallback: false,
    customGatewayRules: false,
    emailDigest: false,
    recalcHistory: false,
  },
  GROWTH: {
    ordersPerMonth: Number.POSITIVE_INFINITY,
    expenses: Number.POSITIVE_INFINITY,
    productRows: Number.POSITIVE_INFINITY,
    csvImport: true,
    csvExport: true,
    adSpendCsv: true,
    shippingCsv: false,
    skuFallback: false,
    customGatewayRules: false,
    emailDigest: false,
    recalcHistory: true,
  },
  PRO: {
    ordersPerMonth: Number.POSITIVE_INFINITY,
    expenses: Number.POSITIVE_INFINITY,
    productRows: Number.POSITIVE_INFINITY,
    csvImport: true,
    csvExport: true,
    adSpendCsv: true,
    shippingCsv: true,
    skuFallback: true,
    customGatewayRules: true,
    emailDigest: true,
    recalcHistory: true,
  },
};

const RANK: Record<Plan, number> = { NONE: 0, STARTER: 1, GROWTH: 2, PRO: 3 };

export function planRank(plan: Plan): number {
  return RANK[plan];
}

export function planAtLeast(plan: Plan, min: Plan): boolean {
  return RANK[plan] >= RANK[min];
}

export interface PlanGate {
  ok: boolean;
  plan: Plan;
  required: Plan;
  status: 200 | 402;
}

/** Gate a feature. Callers render an upgrade card when ok is false. */
export function requirePlan(plan: Plan, min: Plan): PlanGate {
  const ok = planAtLeast(plan, min);
  return { ok, plan, required: min, status: ok ? 200 : 402 };
}

export function getPlanLimits(plan: Plan): PlanLimits {
  return PLAN_LIMITS[plan];
}

export function planFromSubscriptionName(name: string | null | undefined): Plan {
  const normalized = (name ?? "").trim().toLowerCase();
  if (normalized.includes("pro")) return "PRO";
  if (normalized.includes("growth")) return "GROWTH";
  if (normalized.includes("starter")) return "STARTER";
  return "NONE";
}
