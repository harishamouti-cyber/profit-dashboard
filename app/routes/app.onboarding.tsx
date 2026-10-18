import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { SaveToast } from "../components/SaveToast";
import db from "../db.server";
import { PageHeader, PremiumPage, RouteErrorBoundary } from "../components/ui";
import { requireShop } from "../lib/shop.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireShop(request);
  const [variants, missing, jobs, adSpend, orders] = await Promise.all([
    db.variant.count({ where: { shopId: shop.id } }),
    db.variant.count({ where: { shopId: shop.id, shopifyUnitCost: null } }),
    db.syncJob.findMany({ where: { shopId: shop.id }, orderBy: { createdAt: "desc" }, take: 5 }),
    db.adSpend.count({ where: { shopId: shop.id } }),
    db.order.count({ where: { shopId: shop.id } }),
  ]);
  const coverage = variants === 0 ? 0 : Math.round(((variants - missing) / variants) * 100);
  const steps = [
    { label: "Sync orders and products", done: jobs.length > 0 || orders > 0 || variants > 0, href: "/app" },
    { label: "Add product costs", done: variants > 0 && missing === 0, href: "/app/costs" },
    { label: "Add ad spend", done: adSpend > 0, href: "/app/ad-spend" },
    { label: "Review fees and shipping", done: shop.onboardingDone, href: "/app/settings" },
  ];
  return {
    coverage,
    variants,
    feeMode: shop.feeMode,
    shippingCostMode: shop.shippingCostMode,
    adSpend,
    onboardingDone: shop.onboardingDone,
    jobs: jobs.map((job) => `${job.kind}: ${job.status} (${job.objectCount})`),
    steps,
    doneCount: steps.filter((step) => step.done).length,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await requireShop(request);
  await db.shop.update({ where: { id: shop.id }, data: { onboardingDone: true } });
  return { message: "Onboarding marked complete." };
};

export default function Onboarding() {
  const data = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return (
    <s-page heading="Get started">
      <PremiumPage>
        <PageHeader
          eyebrow="Get started"
          icon="sparkle"
          title="Set up in about five minutes"
          subtitle="Four quick steps and your profit numbers are accurate to the cent."
        />
        <div className="pd-card" style={{ padding: "14px 18px" }}>
          <div className="pd-meter-top" style={{ marginBottom: 8 }}><span>{data.doneCount} of {data.steps.length} steps done</span><span>{Math.round((data.doneCount / data.steps.length) * 100)}%</span></div>
          <div className="pd-bar"><i style={{ width: `${Math.round((data.doneCount / data.steps.length) * 100)}%` }} /></div>
        </div>
      <s-stack direction="block" gap="base">
        <SaveToast message={result?.message} />
        <s-section heading={`${data.doneCount} of ${data.steps.length} complete`}>
          <s-paragraph>
            {data.jobs.length ? data.jobs.join(" · ") : "Waiting for the first backfill. This page is safe to open before it finishes."}
          </s-paragraph>
          {data.steps.map((step) => (
            <s-stack key={step.label} direction="inline" gap="small-200">
              <s-icon type={step.done ? "check-circle" : "circle"} tone={step.done ? "success" : "neutral"} />
              <s-link href={step.href}>{step.label}</s-link>
              <s-badge tone={step.done ? "success" : "neutral"}>{step.done ? "Done" : "To do"}</s-badge>
            </s-stack>
          ))}
        </s-section>
        <s-section heading="Cost coverage">
          <s-paragraph>{data.coverage}% of {data.variants} variants have a Shopify unit cost.</s-paragraph>
          <s-link href="/app/costs">Add product costs</s-link>
        </s-section>
        <s-section heading="Fees and shipping">
          <s-paragraph>Fee mode {data.feeMode}. Shipping mode {data.shippingCostMode}.</s-paragraph>
          <s-link href="/app/settings">Edit settings</s-link>
        </s-section>
        <s-section heading="Ad spend">
          <s-paragraph>{data.adSpend === 0 ? "No ad spend yet. Profit still works, but MER stays blank." : `${data.adSpend} ad spend rows saved.`}</s-paragraph>
          <s-link href="/app/ad-spend">Add ad spend</s-link>
        </s-section>
        <Form method="post">
          <s-button type="submit" variant="primary">{data.onboardingDone ? "Onboarding complete" : "Finish onboarding"}</s-button>
        </Form>
      </s-stack>
      </PremiumPage>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);

export const ErrorBoundary = RouteErrorBoundary;
