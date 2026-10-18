import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { requireShop } from "../lib/shop.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireShop(request);
  const [variants, missing, jobs, adSpend] = await Promise.all([
    db.variant.count({ where: { shopId: shop.id } }),
    db.variant.count({ where: { shopId: shop.id, shopifyUnitCost: null } }),
    db.syncJob.findMany({ where: { shopId: shop.id }, orderBy: { createdAt: "desc" }, take: 5 }),
    db.adSpend.count({ where: { shopId: shop.id } }),
  ]);
  const coverage = variants === 0 ? 0 : Math.round(((variants - missing) / variants) * 100);
  return {
    coverage,
    variants,
    feeMode: shop.feeMode,
    shippingCostMode: shop.shippingCostMode,
    adSpend,
    onboardingDone: shop.onboardingDone,
    jobs: jobs.map((job) => `${job.kind}: ${job.status} (${job.objectCount})`),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await requireShop(request);
  await db.shop.update({ where: { id: shop.id }, data: { onboardingDone: true } });
  return { ok: true };
};

export default function Onboarding() {
  const data = useLoaderData<typeof loader>();
  return (
    <s-page heading="Get started">
      <s-stack direction="block" gap="base">
        <s-section heading="1. Sync">
          <s-paragraph>{data.jobs.length ? data.jobs.join(" · ") : "Waiting for the first backfill."}</s-paragraph>
        </s-section>
        <s-section heading="2. Cost coverage">
          <s-paragraph>{data.coverage}% of {data.variants} variants have a Shopify unit cost.</s-paragraph>
          <s-link href="/app/costs">Review costs</s-link>
        </s-section>
        <s-section heading="3. Fees and shipping">
          <s-paragraph>Fee mode {data.feeMode}. Shipping mode {data.shippingCostMode}.</s-paragraph>
          <s-link href="/app/settings">Edit settings</s-link>
        </s-section>
        <s-section heading="4. Ad spend">
          <s-paragraph>{data.adSpend} ad spend rows saved.</s-paragraph>
          <s-link href="/app/ad-spend">Add ad spend</s-link>
        </s-section>
        <Form method="post">
          <s-button type="submit" variant="primary">{data.onboardingDone ? "Onboarding complete" : "Finish onboarding"}</s-button>
        </Form>
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
