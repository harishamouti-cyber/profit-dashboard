import { useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { SaveToast } from "../components/SaveToast";
import { billingMode, createSubscriptionRaw, isTestCharge, pricingPageUrl } from "../lib/billing.server";
import { PLAN_PRICES, type BillingPlanName } from "../lib/plan";
import { requireShop } from "../lib/shop.server";
import { authenticate } from "../shopify.server";

const FEATURES: Record<BillingPlanName, string[]> = {
  Starter: ["Dashboard and daily P&L", "Up to 300 orders a month counted", "3 expenses", "Top 10 products", "No per-order fees"],
  Growth: ["Unlimited orders and expenses", "Cost and ad spend CSV", "Recalculate cost history", "Full product table and exports", "No per-order fees"],
  Pro: ["Everything in Growth", "Shipping CSV and SKU fallback costs", "Custom gateway rules", "Weekly P&L digest", "No per-order fees"],
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireShop(request);
  return {
    plan: shop.plan,
    mode: billingMode(),
    pricingUrl: pricingPageUrl(shop.shopDomain),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session, billing } = await authenticate.admin(request);
  const form = await request.formData();
  const plan = String(form.get("plan") ?? "") as BillingPlanName;
  if (!PLAN_PRICES[plan]) return { message: "Unknown plan." };
  const mode = billingMode();
  const returnUrl = `${process.env.SHOPIFY_APP_URL || ""}/app/billing`;
  if (mode === "shopify_app_pricing") {
    return { pricingUrl: pricingPageUrl(session.shop) };
  }
  if (mode === "manual_raw") {
    const result = await createSubscriptionRaw(admin, plan, returnUrl);
    if (result.userErrors.length > 0) return { message: result.userErrors.join("; ") };
    return { confirmationUrl: result.confirmationUrl };
  }
  return billing.request({
    plan,
    isTest: isTestCharge(),
    returnUrl,
  });
};

export default function BillingPage() {
  const data = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  useEffect(() => {
    const url = result && "confirmationUrl" in result ? result.confirmationUrl : result && "pricingUrl" in result ? result.pricingUrl : null;
    if (url && typeof shopify !== "undefined") {
      window.open(url, "_top");
    }
  }, [result]);

  return (
    <s-page heading="Plan">
      <s-stack direction="block" gap="base">
        <SaveToast message={result && "message" in result ? result.message : null} />
        <s-paragraph>Flat monthly pricing. No per-order fees on any plan. Current plan: {data.plan}.</s-paragraph>
        {data.mode === "shopify_app_pricing" ? (
          <s-banner tone="info" heading="Shopify App Pricing">
            <s-paragraph>New public apps use the Shopify-hosted plan page. Gating still reads the active subscription.</s-paragraph>
          </s-banner>
        ) : null}
        <s-grid gridTemplateColumns="repeat(3, minmax(0, 1fr))" gap="base">
          {(Object.keys(PLAN_PRICES) as BillingPlanName[]).map((name) => {
            const plan = PLAN_PRICES[name];
            const current = data.plan === plan.plan;
            return (
              <s-section key={name} heading={`${plan.label} $${plan.amount}/mo`}>
                {current ? <s-badge tone="success">Current</s-badge> : null}
                {FEATURES[name].map((feature) => (
                  <s-paragraph key={feature}>{feature}</s-paragraph>
                ))}
                {data.mode === "shopify_app_pricing" ? (
                  <s-button href={data.pricingUrl} target="_top" variant="primary">Choose {plan.label}</s-button>
                ) : (
                  <Form method="post">
                    <input type="hidden" name="plan" value={name} />
                    <s-button type="submit" variant="primary">Choose {plan.label}</s-button>
                  </Form>
                )}
              </s-section>
            );
          })}
        </s-grid>
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
