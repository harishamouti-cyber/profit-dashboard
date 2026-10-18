import { APP_SUBSCRIPTION_CREATE } from "./graphql/queries";
import { PLAN_PRICES, type BillingPlanName } from "./plan.server";

export type BillingMode = "shopify_app_pricing" | "package" | "manual_raw";

export interface AdminClient {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
}

/** Shopify App Pricing is the default for a new public app. */
export function billingMode(): BillingMode {
  const raw = process.env.BILLING_MODE ?? "shopify_app_pricing";
  if (raw === "package" || raw === "manual_raw" || raw === "shopify_app_pricing") return raw;
  return "shopify_app_pricing";
}

export function isTestCharge(): boolean {
  return process.env.NODE_ENV !== "production";
}

/** Hosted plan-selection page used when BILLING_MODE=shopify_app_pricing. */
export function pricingPageUrl(shopDomain: string): string {
  const handle = process.env.SHOPIFY_APP_HANDLE || "profit-dashboard";
  const store = shopDomain.replace(/\.myshopify\.com$/i, "");
  return `https://admin.shopify.com/store/${store}/charges/${handle}/pricing_plans`;
}

export interface RawSubscriptionResult {
  confirmationUrl: string | null;
  subscriptionGid: string | null;
  status: string | null;
  userErrors: string[];
}

/** Legacy Billing API mutation, used only when BILLING_MODE=manual_raw. */
export async function createSubscriptionRaw(
  admin: AdminClient,
  planName: BillingPlanName,
  returnUrl: string,
): Promise<RawSubscriptionResult> {
  const plan = PLAN_PRICES[planName];
  const response = await admin.graphql(APP_SUBSCRIPTION_CREATE, {
    variables: {
      name: plan.label,
      price: plan.amount,
      returnUrl,
      test: isTestCharge(),
      trialDays: 7,
    },
  });
  const json = (await response.json()) as {
    data?: {
      appSubscriptionCreate?: {
        confirmationUrl?: string | null;
        appSubscription?: { id?: string; status?: string } | null;
        userErrors?: Array<{ message?: string }>;
      };
    };
    errors?: Array<{ message?: string }>;
  };
  const payload = json.data?.appSubscriptionCreate;
  const userErrors = [
    ...(json.errors ?? []).map((error) => error.message ?? "GraphQL error"),
    ...(payload?.userErrors ?? []).map((error) => error.message ?? "user error"),
  ];
  return {
    confirmationUrl: payload?.confirmationUrl ?? null,
    subscriptionGid: payload?.appSubscription?.id ?? null,
    status: payload?.appSubscription?.status ?? null,
    userErrors,
  };
}
