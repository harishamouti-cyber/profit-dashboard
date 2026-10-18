/** Client-safe plan catalog. Server gating lives in plan.server.ts. */

export const PLAN_PRICES = {
  Starter: { plan: "STARTER" as const, amount: 9, label: "Starter" },
  Growth: { plan: "GROWTH" as const, amount: 19, label: "Growth" },
  Pro: { plan: "PRO" as const, amount: 29, label: "Pro" },
};

export type BillingPlanName = keyof typeof PLAN_PRICES;
