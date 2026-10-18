import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { CsvDropZone } from "../components/CsvDropZone";
import { SaveToast } from "../components/SaveToast";
import { UpgradeCard } from "../components/UpgradeCard";
import db from "../db.server";
import { enqueue } from "../jobs/queue.server";
import { parseShippingCsv } from "../lib/csv";
import { fmt, isMoney } from "../lib/money";
import { getPlanLimits } from "../lib/plan.server";
import { PageHeader, PremiumPage, RouteErrorBoundary } from "../components/ui";
import { requireShop } from "../lib/shop.server";
import { estimateRuleNote } from "../lib/sync/bootstrap.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireShop(request);
  const rules = await db.gatewayFeeRule.findMany({ where: { shopId: shop.id }, orderBy: { gateway: "asc" } });
  const limits = getPlanLimits(shop.plan);
  return {
    currency: shop.currencyCode,
    timezone: shop.ianaTimezone,
    feeMode: shop.feeMode,
    shippingCostMode: shop.shippingCostMode,
    shippingFlatCost: shop.shippingFlatCost.toString(),
    shippingPercent: shop.shippingPercent.mul(100).toString(),
    includeTestOrders: shop.includeTestOrders,
    excludeCancelled: shop.excludeCancelled,
    historyDays: shop.historyDays,
    canRules: limits.customGatewayRules,
    canShippingCsv: limits.shippingCsv,
    canDigest: limits.emailDigest,
    rules: rules.map((rule) => ({
      gateway: rule.gateway,
      percent: rule.percent.mul(100).toString(),
      fixed: fmt(rule.fixed, shop.currencyCode),
    })),
    note: estimateRuleNote(),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await requireShop(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "settings");
  const limits = getPlanLimits(shop.plan);
  if (intent === "resync") {
    await enqueue({ shopDomain: shop.shopDomain, type: "start_backfill", payload: {} });
    return { message: "Full resync queued." };
  }
  if (intent === "digest") {
    if (!limits.emailDigest) return { message: "Weekly digest is a Pro feature." };
    const { digestSender } = await import("../lib/digest.server");
    await digestSender.sendWeeklyDigest({
      shopDomain: shop.shopDomain,
      periodLabel: "last 7 days",
      netProfit: "queued",
    });
    return { message: "Digest sender is stubbed. Nothing was emailed." };
  }
  if (intent === "shipping_csv") {
    if (!limits.shippingCsv) return { message: "Per-order shipping CSV is a Pro feature." };
    const parsed = parseShippingCsv(String(form.get("csv") ?? ""));
    for (const row of parsed.rows) {
      await db.shippingCost.upsert({
        where: { shopId_orderName: { shopId: shop.id, orderName: row.orderName } },
        create: { shopId: shop.id, orderName: row.orderName, amount: row.amount },
        update: { amount: row.amount },
      });
    }
    await enqueue({ shopDomain: shop.shopDomain, type: "recompute_shipping", payload: {} });
    return {
      message: `Saved ${parsed.rows.length} shipping costs.`,
      errors: parsed.errors.slice(0, 20).map((error) => `Row ${error.row}: ${error.message}`),
    };
  }
  if (intent === "rule") {
    if (!limits.customGatewayRules) return { message: "Custom gateway rules are a Pro feature." };
    const gateway = String(form.get("gateway") ?? "").trim().toLowerCase().replace(/\s+/g, "_");
    const percentRaw = String(form.get("percent") ?? "0");
    const fixed = String(form.get("fixed") ?? "0");
    if (!gateway) return { message: "Gateway is required.", errors: ["Gateway is required."] };
    if (!isMoney(percentRaw) || !isMoney(fixed)) {
      return { message: "Percent and fixed fee must be numbers.", errors: ["Percent and fixed fee must be numbers."] };
    }
    const percent = Number(percentRaw) / 100;
    await db.gatewayFeeRule.upsert({
      where: { shopId_gateway: { shopId: shop.id, gateway } },
      create: { shopId: shop.id, gateway, percent: percent.toFixed(4), fixed },
      update: { percent: percent.toFixed(4), fixed },
    });
    await enqueue({ shopDomain: shop.shopDomain, type: "start_backfill", payload: {} });
    return { message: "Rule saved. A resync will recompute fees from stored transactions." };
  }
  const feeMode = String(form.get("feeMode") ?? shop.feeMode);
  const shippingCostMode = String(form.get("shippingCostMode") ?? shop.shippingCostMode);
  const flat = String(form.get("shippingFlatCost") ?? "0");
  const percentRaw = String(form.get("shippingPercent") ?? "0");
  if (!isMoney(flat || "0") || !isMoney(percentRaw || "0")) {
    return { message: "Shipping amounts must be numbers.", errors: ["Shipping amounts must be numbers."] };
  }
  const percent = Number(percentRaw) / 100;
  await db.shop.update({
    where: { id: shop.id },
    data: {
      feeMode: feeMode === "RULE_ONLY" ? "RULE_ONLY" : "ACTUAL_THEN_RULE",
      shippingCostMode:
        shippingCostMode === "FLAT_PER_ORDER" ||
        shippingCostMode === "PERCENT_OF_SHIPPING_CHARGED" ||
        shippingCostMode === "PER_ORDER_MANUAL"
          ? shippingCostMode
          : "NONE",
      shippingFlatCost: flat || "0",
      shippingPercent: percent.toFixed(4),
      includeTestOrders: form.get("includeTestOrders") === "true",
      excludeCancelled: form.get("excludeCancelled") === "true",
    },
  });
  await enqueue({ shopDomain: shop.shopDomain, type: "recompute_shipping", payload: {} });
  await enqueue({ shopDomain: shop.shopDomain, type: "start_backfill", payload: {} });
  return { message: "Settings saved. Shipping was recomputed and a resync was queued for fees." };
};

export default function SettingsPage() {
  const data = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return (
    <s-page heading="Settings">
      <PremiumPage>
        <PageHeader
          eyebrow="Settings"
          icon="layers"
          title="Fine-tune how profit is calculated"
          subtitle={`Payment fees, shipping costs, and sync options. Store time zone ${data.timezone}, currency ${data.currency}.`}
        />
      <s-stack direction="block" gap="base">
        <SaveToast message={result?.message} errors={result && "errors" in result ? result.errors : []} />
        <s-section heading="Shop">
          <s-paragraph>Timezone {data.timezone}. Currency {data.currency}. History window {data.historyDays} days. These come from Shopify and are read-only here.</s-paragraph>
        </s-section>
        <Form method="post">
          <s-select label="Fee mode" name="feeMode" value={data.feeMode}>
            <s-option value="ACTUAL_THEN_RULE">Actual fees, then gateway rule</s-option>
            <s-option value="RULE_ONLY">Gateway rules only</s-option>
          </s-select>
          <s-select label="Shipping cost" name="shippingCostMode" value={data.shippingCostMode}>
            <s-option value="NONE">None</s-option>
            <s-option value="FLAT_PER_ORDER">Flat per order that ships</s-option>
            <s-option value="PERCENT_OF_SHIPPING_CHARGED">Percent of shipping charged</s-option>
            <s-option value="PER_ORDER_MANUAL">Per order from CSV only</s-option>
          </s-select>
          <s-number-field label="Flat cost" name="shippingFlatCost" value={data.shippingFlatCost} />
          <s-number-field label="Shipping percent" name="shippingPercent" value={data.shippingPercent} suffix="%" />
          <s-select label="Include test orders" name="includeTestOrders" value={String(data.includeTestOrders)}>
            <s-option value="false">No</s-option>
            <s-option value="true">Yes</s-option>
          </s-select>
          <s-select label="Drop same-day full cancellations" name="excludeCancelled" value={String(data.excludeCancelled)}>
            <s-option value="true">Yes</s-option>
            <s-option value="false">No, keep them</s-option>
          </s-select>
          <s-button type="submit" variant="primary">Save settings</s-button>
        </Form>
        <s-section heading="Gateway rules">
          <s-paragraph>{data.note}</s-paragraph>
          {data.canRules ? (
            <Form method="post">
              <input type="hidden" name="intent" value="rule" />
              <s-text-field label="Gateway" name="gateway" />
              <s-number-field label="Percent" name="percent" suffix="%" />
              <s-number-field label="Fixed fee" name="fixed" />
              <s-button type="submit">Save rule</s-button>
            </Form>
          ) : (
            <UpgradeCard required="Pro" feature="Editing gateway rules is a Pro feature. Seeded estimates still apply on every plan." />
          )}
          <s-table>
            <s-table-header-row>
              <s-table-header>Gateway</s-table-header>
              <s-table-header>Percent</s-table-header>
              <s-table-header>Fixed</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {data.rules.map((rule) => (
                <s-table-row key={rule.gateway}>
                  <s-table-cell>{rule.gateway}</s-table-cell>
                  <s-table-cell>{rule.percent}%</s-table-cell>
                  <s-table-cell>{rule.fixed}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        </s-section>
        <s-section heading="Shipping CSV">
          {data.canShippingCsv ? (
            <CsvDropZone intent="shipping_csv" label="Drop order_name, amount CSV" />
          ) : (
            <UpgradeCard required="Pro" feature="Per-order shipping label costs are a Pro feature." />
          )}
        </s-section>
        <Form method="post">
          <input type="hidden" name="intent" value="resync" />
          <s-button type="submit">Resync all</s-button>
        </Form>
        <s-section heading="Data and privacy">
          <s-paragraph>
            Plainprofit stores order totals, refunds, and product costs only. It never stores your customers&apos; names, emails, phone numbers, or addresses. Your store&apos;s data is deleted 48 hours after you uninstall the app.
          </s-paragraph>
        </s-section>
      </s-stack>
      </PremiumPage>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);

export const ErrorBoundary = RouteErrorBoundary;
