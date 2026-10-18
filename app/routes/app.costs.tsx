import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { CsvDropZone } from "../components/CsvDropZone";
import { EmptyState } from "../components/EmptyState";
import { SaveToast } from "../components/SaveToast";
import { UpgradeCard } from "../components/UpgradeCard";
import db from "../db.server";
import { enqueue } from "../jobs/queue.server";
import { parseCostsCsv } from "../lib/csv";
import { fmt, isMoney } from "../lib/money";
import { getPlanLimits, requirePlan } from "../lib/plan.server";
import { requireShop } from "../lib/shop.server";
import { fromDbDate, todayInZone, toDbDate } from "../lib/tz";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireShop(request);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").toLowerCase();
  const missingOnly = url.searchParams.get("missing") === "1";
  const variants = await db.variant.findMany({
    where: { shopId: shop.id },
    orderBy: { productTitle: "asc" },
    take: 200,
  });
  const costs = await db.variantCost.findMany({
    where: { shopId: shop.id },
    orderBy: { effectiveFrom: "desc" },
  });
  const limits = getPlanLimits(shop.plan);
  const rows = variants
    .filter((variant) => {
      const haystack = `${variant.productTitle} ${variant.variantTitle ?? ""} ${variant.sku ?? ""}`.toLowerCase();
      if (q && !haystack.includes(q)) return false;
      if (missingOnly && variant.shopifyUnitCost != null) return false;
      return true;
    })
    .map((variant) => ({
      id: variant.id,
      variantGid: variant.variantGid,
      title: `${variant.productTitle}${variant.variantTitle ? ` / ${variant.variantTitle}` : ""}`,
      sku: variant.sku ?? "",
      shopifyCost: variant.shopifyUnitCost == null ? "—" : fmt(variant.shopifyUnitCost, shop.currencyCode),
      history: costs
        .filter((cost) => cost.variantGid === variant.variantGid)
        .slice(0, 8)
        .map((cost) => `${fromDbDate(cost.effectiveFrom)} ${cost.source} ${fmt(cost.unitCost, shop.currencyCode)}`),
    }));
  return {
    rows,
    today: todayInZone(shop.ianaTimezone),
    canImport: limits.csvImport,
    canRecalc: limits.recalcHistory,
    currency: shop.currencyCode,
    missingOnly,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await requireShop(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const limits = getPlanLimits(shop.plan);

  if (intent === "override") {
    const variantGid = String(form.get("variantGid") ?? "");
    const unitCost = String(form.get("unitCost") ?? "");
    const effectiveFrom = String(form.get("effectiveFrom") ?? "");
    if (!variantGid || !isMoney(unitCost) || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
      return { message: "Variant, a numeric cost, and an effective date (YYYY-MM-DD) are required.", errors: ["Variant, a numeric cost, and an effective date (YYYY-MM-DD) are required."] };
    }
    await db.variantCost.create({
      data: {
        shopId: shop.id,
        variantGid,
        unitCost,
        effectiveFrom: toDbDate(effectiveFrom),
        source: "MANUAL",
      },
    });
    return { message: "Override saved. Past orders keep their stored cost until you recalculate history." };
  }

  if (intent === "bulk_apply") {
    const unitCost = String(form.get("unitCost") ?? "");
    const effectiveFrom = String(form.get("effectiveFrom") ?? "");
    const filter = String(form.get("filter") ?? "").toLowerCase();
    if (!isMoney(unitCost) || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
      return { message: "Bulk apply needs a numeric cost and an effective date.", errors: ["Bulk apply needs a numeric cost and an effective date."] };
    }
    const variants = await db.variant.findMany({ where: { shopId: shop.id } });
    const matches = variants.filter((variant) => {
      const haystack = `${variant.sku ?? ""} ${variant.productTitle}`.toLowerCase();
      return !filter || haystack.includes(filter);
    });
    await db.variantCost.createMany({
      data: matches.map((variant) => ({
        shopId: shop.id,
        variantGid: variant.variantGid,
        unitCost,
        effectiveFrom: toDbDate(effectiveFrom),
        source: "MANUAL",
      })),
    });
    return { message: `Applied a cost to ${matches.length} variants.` };
  }

  if (intent === "import_csv") {
    const gate = requirePlan(shop.plan, "GROWTH");
    if (!gate.ok || !limits.csvImport) return { upgrade: true, message: "Cost CSV import is on Growth and Pro." };
    const parsed = parseCostsCsv(String(form.get("csv") ?? ""));
    let applied = 0;
    for (const row of parsed.rows) {
      const variant = await db.variant.findFirst({ where: { shopId: shop.id, sku: row.sku } });
      if (!variant) {
        parsed.errors.push({ row: 0, message: `No variant with SKU ${row.sku}` });
        continue;
      }
      await db.variantCost.create({
        data: {
          shopId: shop.id,
          variantGid: variant.variantGid,
          unitCost: row.unitCost,
          effectiveFrom: toDbDate(row.effectiveFrom),
          source: "CSV",
        },
      });
      applied += 1;
    }
    return {
      message: `Imported ${applied} costs.`,
      errors: parsed.errors.slice(0, 20).map((error) => (error.row ? `Row ${error.row}: ${error.message}` : error.message)),
    };
  }

  if (intent === "recalc") {
    const gate = requirePlan(shop.plan, "GROWTH");
    if (!gate.ok) return { upgrade: true, message: "Recalculate history is on Growth and Pro." };
    await enqueue({ shopDomain: shop.shopDomain, type: "recalc_costs", payload: {} });
    return { message: "Recalculation queued. Dashboards update when the job finishes." };
  }

  if (intent === "sku_fallback") {
    const gate = requirePlan(shop.plan, "PRO");
    if (!gate.ok) return { upgrade: true, message: "SKU fallback costs are a Pro feature." };
    const sku = String(form.get("sku") ?? "").trim();
    const unitCost = String(form.get("unitCost") ?? "");
    const effectiveFrom = String(form.get("effectiveFrom") ?? "");
    if (!sku || !isMoney(unitCost) || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
      return { message: "SKU, a numeric cost, and an effective date are required.", errors: ["SKU, a numeric cost, and an effective date are required."] };
    }
    await db.variantCost.create({
      data: {
        shopId: shop.id,
        variantGid: `sku:${sku}`,
        unitCost,
        effectiveFrom: toDbDate(effectiveFrom),
        source: "SKU_FALLBACK",
        note: "Fallback for lines with no variant",
      },
    });
    return { message: `SKU fallback saved for ${sku}.` };
  }

  return { message: "Nothing to save." };
};

export default function Costs() {
  const data = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const [params] = useSearchParams();
  return (
    <s-page heading="Costs">
      <s-stack direction="block" gap="base">
        <s-paragraph>
          Shopify cost is read-only. An override uses the latest effective date. On the same date, a manual or CSV cost beats the Shopify cost. Historical orders keep the cost stored at ingest until you recalculate.
        </s-paragraph>
        <SaveToast message={result?.message} errors={result && "errors" in result ? result.errors : []} />
        <Form method="get">
          <s-search-field label="Filter" name="q" value={params.get("q") ?? ""} />
          <s-button type="submit" variant="secondary">Filter</s-button>
          <s-link href="/app/costs?missing=1">Missing Shopify cost</s-link>
        </Form>
        <s-section heading="Bulk apply">
          <Form method="post">
            <input type="hidden" name="intent" value="bulk_apply" />
            <s-text-field label="Filter text" name="filter" />
            <s-number-field label={`Unit cost (${data.currency})`} name="unitCost" />
            <s-date-field label="Effective from" name="effectiveFrom" value={data.today} />
            <s-button type="submit" variant="primary">Apply to filtered</s-button>
          </Form>
        </s-section>
        {data.canImport ? (
          <s-section heading="CSV import">
            <s-paragraph>Columns: sku, unit_cost, effective_from</s-paragraph>
            <CsvDropZone intent="import_csv" label="Drop a cost CSV" />
          </s-section>
        ) : (
          <UpgradeCard feature="Cost CSV import, effective-dated history import, and recalculate history are on Growth and Pro." />
        )}
        {data.canRecalc ? (
          <Form method="post">
            <input type="hidden" name="intent" value="recalc" />
            <s-button type="submit">Recalculate history</s-button>
          </Form>
        ) : null}
        <s-section heading="SKU fallback (Pro)">
          <Form method="post">
            <input type="hidden" name="intent" value="sku_fallback" />
            <s-text-field label="SKU" name="sku" />
            <s-number-field label="Unit cost" name="unitCost" />
            <s-date-field label="Effective from" name="effectiveFrom" value={data.today} />
            <s-button type="submit" variant="secondary">Save SKU fallback</s-button>
          </Form>
        </s-section>
        {data.rows.length === 0 ? (
          <EmptyState
            heading={data.missingOnly ? "No missing costs in this filter" : "No variants yet"}
            icon="product"
            body={data.missingOnly ? "Every variant in the filter has a Shopify cost, or the catalog is still syncing." : "The product catalog syncs after install. You can leave this page open; it stays usable with an empty list."}
            href="/app/onboarding"
            action="Check sync progress"
          />
        ) : null}
        <s-table>
          <s-table-header-row>
            <s-table-header>Variant</s-table-header>
            <s-table-header>SKU</s-table-header>
            <s-table-header>Shopify cost</s-table-header>
            <s-table-header>Override</s-table-header>
            <s-table-header>History</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {data.rows.map((row) => (
              <s-table-row key={row.id}>
                <s-table-cell>{row.title}</s-table-cell>
                <s-table-cell>{row.sku}</s-table-cell>
                <s-table-cell>{row.shopifyCost}</s-table-cell>
                <s-table-cell>
                  <Form method="post">
                    <input type="hidden" name="intent" value="override" />
                    <input type="hidden" name="variantGid" value={row.variantGid} />
                    <s-number-field label="Cost" name="unitCost" />
                    <s-date-field label="From" name="effectiveFrom" value={data.today} />
                    <s-button type="submit" variant="secondary">Save</s-button>
                  </Form>
                </s-table-cell>
                <s-table-cell>
                  <s-button commandFor={`hist-${row.id}`} command="--toggle" variant="tertiary">History</s-button>
                  <s-popover id={`hist-${row.id}`}>
                    <s-box padding="base">
                      {row.history.length === 0 ? <s-paragraph>No history yet.</s-paragraph> : row.history.map((entry) => (
                        <s-paragraph key={entry}>{entry}</s-paragraph>
                      ))}
                    </s-box>
                  </s-popover>
                </s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
