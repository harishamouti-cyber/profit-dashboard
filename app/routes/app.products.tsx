import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { EmptyState } from "../components/EmptyState";
import db from "../db.server";
import { D, fmt, fmtRatio } from "../lib/money";
import { getPlanLimits } from "../lib/plan.server";
import { requireShop } from "../lib/shop.server";
import { marginLabel, marginTone } from "../lib/profit/margin";
import { safeRange, todayInZone, toDbDate } from "../lib/tz";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireShop(request);
  const url = new URL(request.url);
  const today = todayInZone(shop.ianaTimezone);
  const { from, to } = safeRange(
    { preset: url.searchParams.get("preset"), from: url.searchParams.get("from"), to: url.searchParams.get("to") },
    today,
  );
  const q = (url.searchParams.get("q") ?? "").toLowerCase();
  const sortParam = url.searchParams.get("sort");
  const sort = sortParam === "profit_asc" || sortParam === "margin_asc" || sortParam === "margin_desc" ? sortParam : "profit_desc";
  const rows = await db.productDailyMetric.findMany({
    where: { shopId: shop.id, date: { gte: toDbDate(from), lte: toDbDate(to) } },
  });
  const variants = await db.variant.findMany({
    where: { shopId: shop.id },
    select: { productGid: true, productTitle: true, sku: true },
  });
  const titles = new Map<string, string>();
  for (const variant of variants) {
    if (!titles.has(variant.productGid)) titles.set(variant.productGid, variant.productTitle);
  }
  const grouped = new Map<string, { unitsSold: number; unitsReturned: number; netSales: ReturnType<typeof D>; cogs: ReturnType<typeof D>; fees: ReturnType<typeof D>; grossProfit: ReturnType<typeof D> }>();
  for (const row of rows) {
    const current = grouped.get(row.productGid) ?? {
      unitsSold: 0,
      unitsReturned: 0,
      netSales: D(0),
      cogs: D(0),
      fees: D(0),
      grossProfit: D(0),
    };
    current.unitsSold += row.unitsSold;
    current.unitsReturned += row.unitsReturned;
    current.netSales = current.netSales.plus(D(row.netSales));
    current.cogs = current.cogs.plus(D(row.cogs));
    current.fees = current.fees.plus(D(row.allocatedFees));
    current.grossProfit = current.grossProfit.plus(D(row.grossProfit));
    grouped.set(row.productGid, current);
  }
  let products = [...grouped.entries()].map(([productGid, row]) => ({
    productGid,
    title: titles.get(productGid) ?? productGid,
    unitsSold: row.unitsSold,
    unitsReturned: row.unitsReturned,
    netSales: fmt(row.netSales, shop.currencyCode),
    cogs: fmt(row.cogs, shop.currencyCode),
    fees: fmt(row.fees, shop.currencyCode),
    grossProfit: fmt(row.grossProfit, shop.currencyCode),
    grossProfitRaw: row.grossProfit.toString(),
    marginValue: row.netSales.isZero() ? null : row.grossProfit.div(row.netSales),
    margin: fmtRatio(row.netSales.isZero() ? null : row.grossProfit.div(row.netSales)),
    covered: row.cogs.gt(0) || row.unitsSold === 0,
  }));
  if (q) products = products.filter((product) => product.title.toLowerCase().includes(q));
  products.sort((a, b) => {
    if (sort === "margin_asc" || sort === "margin_desc") {
      const left = a.marginValue ?? D(-1);
      const right = b.marginValue ?? D(-1);
      const delta = D(left).minus(D(right));
      return sort === "margin_asc" ? delta.cmp(0) : delta.neg().cmp(0);
    }
    const delta = D(a.grossProfitRaw).minus(D(b.grossProfitRaw));
    return sort === "profit_asc" ? delta.cmp(0) : delta.neg().cmp(0);
  });
  const limits = getPlanLimits(shop.plan);
  const capped = Number.isFinite(limits.productRows) ? products.slice(0, limits.productRows) : products;
  const visible = capped.map(({ marginValue, ...product }) => {
    const tone = marginTone(marginValue);
    return { ...product, marginTone: tone, marginLabel: marginLabel(tone) };
  });
  return {
    products: visible,
    hidden: products.length - capped.length,
    canExport: limits.csvExport,
    from,
    to,
    sort,
    currency: shop.currencyCode,
    variantCount: variants.length,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await requireShop(request);
  return null;
};

export default function Products() {
  const data = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  return (
    <s-page heading="Product profit">
      <s-stack direction="block" gap="base">
        <s-paragraph>
          Ad spend and expenses are not allocated to products. Fees are split inside each order by ex-tax line net sales. Amounts are in {data.currency}.
        </s-paragraph>
        <Form method="get">
          <input type="hidden" name="from" value={data.from} />
          <input type="hidden" name="to" value={data.to} />
          <input type="hidden" name="sort" value={data.sort} />
          <s-search-field label="Search products" name="q" value={params.get("q") ?? ""} />
          <s-button type="submit" variant="secondary">Search</s-button>
        </Form>
        <s-button-group>
          <s-button href={`?sort=profit_desc&from=${data.from}&to=${data.to}&q=${params.get("q") ?? ""}`} variant={data.sort === "profit_desc" ? "primary" : "tertiary"}>Profit</s-button>
          <s-button href={`?sort=profit_asc&from=${data.from}&to=${data.to}&q=${params.get("q") ?? ""}`} variant="tertiary">Lowest profit</s-button>
          <s-button href={`?sort=margin_desc&from=${data.from}&to=${data.to}&q=${params.get("q") ?? ""}`} variant="tertiary">Margin</s-button>
          <s-button href={`?sort=margin_asc&from=${data.from}&to=${data.to}&q=${params.get("q") ?? ""}`} variant="tertiary">Lowest margin</s-button>
        </s-button-group>
        {data.hidden > 0 ? (
          <s-banner tone="info" heading="Starter shows the top 10">
            <s-paragraph>
              {data.hidden} more products are hidden. <s-link href="/app/billing">Upgrade</s-link>
            </s-paragraph>
          </s-banner>
        ) : null}
        {data.canExport ? (
          <s-link href={`/api/export/products?from=${data.from}&to=${data.to}`}>Export CSV</s-link>
        ) : (
          <s-paragraph>CSV export is included on Growth and Pro.</s-paragraph>
        )}
        {data.products.length === 0 ? (
          <EmptyState
            heading="No product sales in this range"
            icon="product"
            body={data.variantCount === 0 ? "The catalog has not synced yet. You can still add costs once variants arrive." : "Try another date range, or add costs so the next orders have a margin."}
            href="/app/costs"
            action="Add product costs"
          />
        ) : null}
        <s-table>
          <s-table-header-row>
            <s-table-header>Product</s-table-header>
            <s-table-header>Units</s-table-header>
            <s-table-header>Returned</s-table-header>
            <s-table-header>Net sales</s-table-header>
            <s-table-header>COGS</s-table-header>
            <s-table-header>Fees</s-table-header>
            <s-table-header>Gross profit</s-table-header>
            <s-table-header>Margin</s-table-header>
            <s-table-header>Cost</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {data.products.map((product) => (
              <s-table-row key={product.productGid}>
                <s-table-cell>{product.title}</s-table-cell>
                <s-table-cell>{product.unitsSold}</s-table-cell>
                <s-table-cell>{product.unitsReturned}</s-table-cell>
                <s-table-cell>{product.netSales}</s-table-cell>
                <s-table-cell>{product.cogs}</s-table-cell>
                <s-table-cell>{product.fees}</s-table-cell>
                <s-table-cell>{product.grossProfit}</s-table-cell>
                <s-table-cell>
                  <s-badge tone={product.marginTone}>{product.marginLabel} {product.margin}</s-badge>
                </s-table-cell>
                <s-table-cell>
                  <s-badge tone={product.covered ? "success" : "warning"}>{product.covered ? "Costed" : "Missing"}</s-badge>
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
