import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { DateRangePicker } from "../components/DateRangePicker";
import { EmptyState } from "../components/EmptyState";
import { KpiCard } from "../components/KpiCard";
import { ProfitChartLoader } from "../components/ProfitChartLoader";
import { Alert, ButtonLink, Card, ExportButton, Icon, PageHeader, Pill, PremiumPage, RouteErrorBoundary } from "../components/ui";
import db from "../db.server";
import { periodDelta } from "../lib/delta";
import { D, fmt, fmtMultiple, fmtRatio, sum, type Decimal } from "../lib/money";
import { getPlanLimits } from "../lib/plan.server";
import { ratiosFromSums } from "../lib/profit/daily";
import { requireShop } from "../lib/shop.server";
import { fromDbDate, previousPeriod, startOfMonth, todayInZone, toDbDate, safeRange } from "../lib/tz";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireShop(request);
  const url = new URL(request.url);
  const today = todayInZone(shop.ianaTimezone);
  const { from, to } = safeRange(
    {
      preset: url.searchParams.get("preset"),
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    },
    today,
  );
  const previous = previousPeriod(from, to);
  const [current, prior, syncJobs, monthOrders, orderCount] = await Promise.all([
    db.dailyMetric.findMany({
      where: { shopId: shop.id, date: { gte: toDbDate(from), lte: toDbDate(to) } },
      orderBy: { date: "asc" },
    }),
    db.dailyMetric.findMany({
      where: { shopId: shop.id, date: { gte: toDbDate(previous.from), lte: toDbDate(previous.to) } },
    }),
    db.syncJob.findMany({
      where: { shopId: shop.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.order.count({
      where: {
        shopId: shop.id,
        test: false,
        localDate: { gte: toDbDate(startOfMonth(today)), lte: toDbDate(today) },
      },
    }),
    db.order.count({ where: { shopId: shop.id } }),
  ]);

  const totals = (rows: typeof current) => ({
    revenue: sum(rows.map((row) => row.revenue)),
    netProfit: sum(rows.map((row) => row.netProfit)),
    grossProfit: sum(rows.map((row) => row.grossProfit)),
    cogs: sum(rows.map((row) => row.cogs)),
    adSpend: sum(rows.map((row) => row.adSpend)),
    paymentFees: sum(rows.map((row) => row.paymentFees)),
    shippingCost: sum(rows.map((row) => row.shippingCost)),
    expenses: sum(rows.map((row) => row.expenses)),
    orders: rows.reduce((count, row) => count + row.orders, 0),
    missingCostUnits: rows.reduce((count, row) => count + row.missingCostUnits, 0),
  });
  const now = totals(current);
  const then = totals(prior);
  const ratioInput = (rows: typeof current) =>
    rows.map((row) => ({
      revenue: D(row.revenue),
      netProfit: D(row.netProfit),
      grossProfit: D(row.grossProfit),
      adSpend: D(row.adSpend),
    }));
  const ratios = ratiosFromSums(ratioInput(current));
  const priorRatios = ratiosFromSums(ratioInput(prior));
  const limits = getPlanLimits(shop.plan);
  const money = (value: Decimal) => fmt(value, shop.currencyCode);
  // Only the newest run of each sync kind matters; an old failure that was retried is not an error.
  const seenKinds = new Set<string>();
  const latestSync = syncJobs.filter((job) => {
    if (seenKinds.has(job.kind)) return false;
    seenKinds.add(job.kind);
    return true;
  });
  const revenueRaw = Number(now.revenue.toFixed(2));
  const share = (value: Decimal) => (now.revenue.gt(0) ? Math.min(100, Math.max(0, Number(value.div(now.revenue).times(100).toFixed(1))) ) : 0);
  return {
    from,
    to,
    currency: shop.currencyCode,
    historyDays: shop.historyDays,
    plan: shop.plan,
    canExport: limits.csvExport,
    monthOrders,
    orderCount,
    orderCap: limits.ordersPerMonth,
    missingCostUnits: now.missingCostUnits,
    syncing: latestSync.some((job) => job.status === "RUNNING"),
    syncFailed: latestSync.some((job) => job.status === "FAILED"),
    sync: latestSync.map((job) => ({
      kind: job.kind,
      status: job.status,
      count: job.objectCount,
      error: job.error,
    })),
    kpis: {
      revenue: { value: money(now.revenue), ...periodDelta(now.revenue, then.revenue) },
      netProfit: { value: money(now.netProfit), ...periodDelta(now.netProfit, then.netProfit) },
      margin: {
        value: fmtRatio(ratios.margin),
        ...periodDelta(ratios.margin ?? D(0), priorRatios.margin ?? D(0)),
      },
      cogs: { value: money(now.cogs), ...periodDelta(now.cogs, then.cogs) },
      adSpend: { value: money(now.adSpend), ...periodDelta(now.adSpend, then.adSpend) },
      mer: { value: fmtMultiple(ratios.mer), ...periodDelta(ratios.mer ?? D(0), priorRatios.mer ?? D(0)) },
      fees: { value: money(now.paymentFees), ...periodDelta(now.paymentFees, then.paymentFees) },
      shipping: { value: money(now.shippingCost), ...periodDelta(now.shippingCost, then.shippingCost) },
      expenses: { value: money(now.expenses), ...periodDelta(now.expenses, then.expenses) },
      orders: { value: String(now.orders), ...periodDelta(D(now.orders), D(then.orders)) },
    },
    revenueRaw,
    netPositive: !now.netProfit.isNegative(),
    breakdown: [
      { label: "COGS", value: money(now.cogs), share: share(now.cogs) },
      { label: "Payment fees", value: money(now.paymentFees), share: share(now.paymentFees) },
      { label: "Shipping cost", value: money(now.shippingCost), share: share(now.shippingCost) },
      { label: "Ad spend", value: money(now.adSpend), share: share(now.adSpend) },
      { label: "Expenses", value: money(now.expenses), share: share(now.expenses) },
    ],
    chart: current.map((row) => ({
      date: fromDbDate(row.date),
      revenue: Number(D(row.revenue).toFixed(2)),
      netProfit: Number(D(row.netProfit).toFixed(2)),
    })),
    table: current.map((row) => ({
      date: fromDbDate(row.date),
      orders: row.orders,
      revenue: fmt(row.revenue, shop.currencyCode),
      cogs: fmt(row.cogs, shop.currencyCode),
      fees: fmt(row.paymentFees, shop.currencyCode),
      adSpend: fmt(row.adSpend, shop.currencyCode),
      expenses: fmt(row.expenses, shop.currencyCode),
      netProfit: fmt(row.netProfit, shop.currencyCode),
      negative: D(row.netProfit).isNegative(),
    })),
  };
};

const KIND_LABEL: Record<string, string> = {
  ORDERS_BACKFILL: "Orders",
  REFUNDS_BACKFILL: "Refunds",
  COSTS_BACKFILL: "Product costs",
  INCREMENTAL: "Recent changes",
};

function fmtDay(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export default function Dashboard() {
  const data = useLoaderData<typeof loader>();
  const hero = [
    { label: "Net profit", kpi: data.kpis.netProfit, icon: "wallet", featured: true },
    { label: "Revenue", kpi: data.kpis.revenue, icon: "trend" },
    { label: "Margin", kpi: data.kpis.margin, icon: "percent" },
    { label: "Orders", kpi: data.kpis.orders, icon: "cart" },
  ] as const;
  const costs = [
    { label: "COGS", kpi: data.kpis.cogs, invert: true },
    { label: "Ad spend", kpi: data.kpis.adSpend, invert: true },
    { label: "Payment fees", kpi: data.kpis.fees, invert: true },
    { label: "Shipping", kpi: data.kpis.shipping, invert: true },
    { label: "Expenses", kpi: data.kpis.expenses, invert: true },
    { label: "MER", kpi: data.kpis.mer, invert: false },
  ] as const;
  const noOrders = data.table.length === 0 && data.orderCount === 0;
  const emptyRange = data.table.length === 0 && data.orderCount > 0;

  return (
    <s-page heading="Profit">
      <PremiumPage>
        <PageHeader
          eyebrow="Profit dashboard"
          icon="chart"
          title="Your real profit, every day"
          subtitle={`${fmtDay(data.from)} – ${fmtDay(data.to)} · Amounts in ${data.currency} · Compared with the previous period of the same length`}
          actions={
            <>
              {data.canExport ? <ExportButton href={`/api/export/pnl?from=${data.from}&to=${data.to}`} filename={`profit-${data.from}-to-${data.to}.csv`} /> : null}
              <ButtonLink to="/app/costs" icon="tag">Manage costs</ButtonLink>
            </>
          }
        />
        <DateRangePicker from={data.from} to={data.to} />

        {data.missingCostUnits > 0 ? (
          <Alert tone="warning" title="Some sales have no product cost">
            {data.missingCostUnits} units were sold without a cost, so profit looks higher than it is.{" "}
            <Link to="/app/costs?missing=1">Add product costs</Link>
          </Alert>
        ) : null}
        {data.syncFailed ? (
          <Alert tone="critical" title="A sync did not finish">
            {data.sync
              .filter((job) => job.status === "FAILED")
              .map((job) => `${KIND_LABEL[job.kind] ?? job.kind}${job.error ? `: ${job.error}` : ""}`)
              .join(" · ")}{" "}
            <Link to="/app/settings">Resync from Settings</Link>
          </Alert>
        ) : null}
        {data.syncing ? (
          <Alert tone="info" title="Importing your store data">
            {data.sync
              .filter((job) => job.status === "RUNNING")
              .map((job) => `${KIND_LABEL[job.kind] ?? job.kind}${job.count ? ` (${job.count})` : ""}`)
              .join(" · ")}
            . Numbers fill in automatically, usually within a few minutes.
          </Alert>
        ) : null}
        {data.plan === "STARTER" && data.monthOrders > data.orderCap ? (
          <Alert tone="info" title="You passed 300 orders this month">
            {data.monthOrders} orders so far. Starter keeps counting and never charges per order, but Growth adds CSV imports and the full product table.{" "}
            <Link to="/app/billing">Compare plans</Link>
          </Alert>
        ) : null}

        {noOrders ? (
          <Card>
            <EmptyState
              heading="Your first profit numbers are on the way"
              icon="chart-popular"
              body="Orders from the last 60 days import automatically after install. While that runs, add product costs so every sale has an accurate margin."
              href="/app/costs"
              action="Add product costs"
            />
          </Card>
        ) : null}

        <div className="pd-grid pd-g4">
          {hero.map((item) => (
            <KpiCard
              key={item.label}
              label={item.label}
              value={item.kpi.value}
              delta={item.kpi.text}
              tone={item.kpi.tone}
              icon={item.icon}
              featured={"featured" in item && item.featured}
            />
          ))}
        </div>
        <div className="pd-grid pd-g6">
          {costs.map((item) => (
            <KpiCard key={item.label} label={item.label} value={item.kpi.value} delta={item.kpi.text} tone={item.kpi.tone} invert={item.invert} hint="" small />
          ))}
        </div>

        <div className="pd-grid pd-main">
          <Card
            title="Profit over time"
            icon="trend"
            subtitle="Daily net profit (bars) against revenue (line)"
            actions={
              <div className="pd-legend">
                <span><i style={{ background: "linear-gradient(135deg,#0b0d12,#2b2f38)" }} />Net profit</span>
                <span><i style={{ background: "#0b0d12" }} />Revenue</span>
              </div>
            }
          >
            {emptyRange ? (
              <EmptyState
                heading="Nothing in this range"
                icon="calendar"
                body="You have orders, but none fall between these dates. Try a wider range."
                href="?preset=30d"
                action="Show the last 30 days"
              />
            ) : (
              <ProfitChartLoader points={data.chart} currency={data.currency} />
            )}
          </Card>
          <Card title="Where the money goes" icon="layers" subtitle="Each cost as a share of revenue">
            <div className="pd-brk">
              {data.breakdown.map((item) => (
                <div key={item.label} className="pd-brk-row">
                  <div className="pd-brk-top">
                    <span>{item.label}</span>
                    <span><b>{item.value}</b> <span className="pd-muted pd-small">{data.revenueRaw > 0 ? `${item.share}%` : ""}</span></span>
                  </div>
                  <div className="pd-bar"><i style={{ width: `${item.share}%` }} /></div>
                </div>
              ))}
              <div className="pd-brk-top" style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                <span className="strong">Net profit</span>
                <b className={data.netPositive ? "pd-pos" : "pd-neg"}>{data.kpis.netProfit.value}</b>
              </div>
            </div>
          </Card>
        </div>

        <Card
          title="Daily profit and loss"
          icon="receipt"
          flush
          subtitle="One row per day in your store's time zone"
          footer="Margin and MER use the totals of this range, not an average of daily ratios. Tax, duties, tips, and gift card sales stay out of revenue."
        >
          {data.table.length === 0 ? (
            <div style={{ padding: "26px 22px" }} className="pd-muted">No days to show yet.</div>
          ) : (
            <div className="pd-table-wrap">
              <table className="pd-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="r">Orders</th>
                    <th className="r">Revenue</th>
                    <th className="r">COGS</th>
                    <th className="r">Fees</th>
                    <th className="r">Ad spend</th>
                    <th className="r">Expenses</th>
                    <th className="r">Net profit</th>
                  </tr>
                </thead>
                <tbody>
                  {data.table.map((row) => (
                    <tr key={row.date}>
                      <td className="strong">{fmtDay(row.date)}</td>
                      <td className="r">{row.orders}</td>
                      <td className="r">{row.revenue}</td>
                      <td className="r pd-muted">{row.cogs}</td>
                      <td className="r pd-muted">{row.fees}</td>
                      <td className="r pd-muted">{row.adSpend}</td>
                      <td className="r pd-muted">{row.expenses}</td>
                      <td className="r"><Pill tone={row.negative ? "critical" : "success"}>{row.netProfit}</Pill></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {data.historyDays <= 60 ? (
          <p className="pd-muted pd-small" style={{ display: "flex", gap: 6, alignItems: "center", margin: 0 }}>
            <Icon name="info" size={13} />History covers the last 60 days. Older orders need extra access that Shopify approves separately.
          </p>
        ) : null}
      </PremiumPage>
    </s-page>
  );
}

export const ErrorBoundary = RouteErrorBoundary;

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
