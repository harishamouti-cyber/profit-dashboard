import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, Link, useLoaderData, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { DateRangePicker } from "../components/DateRangePicker";
import { EmptyState } from "../components/EmptyState";
import { Alert, Card, ExportButton, Icon, PageHeader, Pill, PremiumPage, RouteErrorBoundary } from "../components/ui";
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
    negative: row.grossProfit.isNegative(),
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
    plan: shop.plan,
    totalProducts: products.length,
    totals: {
      units: products.reduce((count, product) => count + product.unitsSold, 0),
      missing: products.filter((product) => !product.covered).length,
    },
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await requireShop(request);
  return null;
};

const SORTS = [
  ["profit_desc", "Most profit"],
  ["profit_asc", "Least profit"],
  ["margin_desc", "Best margin"],
  ["margin_asc", "Worst margin"],
] as const;

export default function Products() {
  const data = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const q = params.get("q") ?? "";
  const sortHref = (sort: string) => {
    const next = new URLSearchParams(params);
    next.set("sort", sort);
    return `?${next.toString()}`;
  };
  const exportHref = `/api/export/products?from=${data.from}&to=${data.to}`;
  return (
    <s-page heading="Product profit">
      <PremiumPage>
        <PageHeader
          eyebrow="Products"
          icon="box"
          title="Which products actually make money"
          subtitle={`Gross profit per product after COGS and payment fees. Ad spend and expenses are not allocated to products. Amounts in ${data.currency}.`}
          actions={
            data.canExport ? (
              <ExportButton href={exportHref} filename={`product-profit-${data.from}-to-${data.to}.csv`} />
            ) : (
              <Link to="/app/billing" className="pd-btn ghost"><Icon name="lock" size={14} />Export on Growth</Link>
            )
          }
        />
        <DateRangePicker from={data.from} to={data.to} />

        <div className="pd-grid pd-g3">
          <div className="pd-card pd-kpi sm"><div className="pd-kpi-l">Products sold</div><div className="pd-kpi-v">{data.totalProducts}</div></div>
          <div className="pd-card pd-kpi sm"><div className="pd-kpi-l">Units sold</div><div className="pd-kpi-v">{data.totals.units}</div></div>
          <div className="pd-card pd-kpi sm">
            <div className="pd-kpi-l">Missing a cost</div>
            <div className="pd-kpi-v" style={{ color: data.totals.missing > 0 ? "var(--warn)" : undefined }}>{data.totals.missing}</div>
          </div>
        </div>

        {data.hidden > 0 ? (
          <Alert tone="info" title={`Starter shows your top 10 products`}>
            {data.hidden} more products are hidden. <Link to="/app/billing">Upgrade to see every product</Link>
          </Alert>
        ) : null}

        <Card
          flush
          title="Product table"
          icon="tag"
          actions={
            <nav className="pd-seg" aria-label="Sort">
              {SORTS.map(([value, label]) => (
                <Link key={value} to={sortHref(value)} className={data.sort === value ? "on" : ""} preventScrollReset>{label}</Link>
              ))}
            </nav>
          }
        >
          <div style={{ padding: "14px 22px", borderBottom: "1px solid var(--line)" }}>
            <Form method="get" className="pd-toolbar">
              <input type="hidden" name="from" value={data.from} />
              <input type="hidden" name="to" value={data.to} />
              <input type="hidden" name="sort" value={data.sort} />
              <div className="pd-search">
                <Icon name="search" size={14} />
                <input className="pd-input" type="search" name="q" defaultValue={q} placeholder="Search products" aria-label="Search products" />
              </div>
              <button type="submit" className="pd-btn dark sm">Search</button>
            </Form>
          </div>
          {data.products.length === 0 ? (
            <EmptyState
              heading={q ? `No products match "${q}"` : "No product sales in this range"}
              icon="product"
              body={
                data.variantCount === 0
                  ? "Your catalog is still importing. Products appear here after their first sale."
                  : q
                    ? "Try a different search, or clear it to see every product."
                    : "Try a wider date range, or add costs now so the next orders have a margin."
              }
              href={q ? `?from=${data.from}&to=${data.to}&sort=${data.sort}` : "/app/costs"}
              action={q ? "Clear search" : "Add product costs"}
            />
          ) : (
            <div className="pd-table-wrap">
              <table className="pd-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="r">Units</th>
                    <th className="r">Returned</th>
                    <th className="r">Net sales</th>
                    <th className="r">COGS</th>
                    <th className="r">Fees</th>
                    <th className="r">Gross profit</th>
                    <th>Margin</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data.products.map((product) => (
                    <tr key={product.productGid}>
                      <td className="strong">{product.title}</td>
                      <td className="r">{product.unitsSold}</td>
                      <td className="r pd-muted">{product.unitsReturned}</td>
                      <td className="r">{product.netSales}</td>
                      <td className="r pd-muted">{product.cogs}</td>
                      <td className="r pd-muted">{product.fees}</td>
                      <td className={`r ${product.negative ? "pd-neg" : "strong"}`}>{product.grossProfit}</td>
                      <td><Pill tone={product.marginTone}>{product.marginLabel} {product.margin}</Pill></td>
                      <td>
                        {product.covered ? (
                          <Pill tone="success">Costed</Pill>
                        ) : (
                          <Link to={`/app/costs?q=${encodeURIComponent(product.title)}`}><Pill tone="warning">Add cost</Pill></Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </PremiumPage>
    </s-page>
  );
}

export const ErrorBoundary = RouteErrorBoundary;

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
