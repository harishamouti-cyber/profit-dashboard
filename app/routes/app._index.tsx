import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { DateRangePicker } from "../components/DateRangePicker";
import { EmptyState } from "../components/EmptyState";
import { KpiCard } from "../components/KpiCard";
import { ProfitChartLoader } from "../components/ProfitChartLoader";
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
      take: 5,
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
  return {
    from,
    to,
    currency: shop.currencyCode,
    historyDays: shop.historyDays,
    plan: shop.plan,
    monthOrders,
    orderCount,
    orderCap: limits.ordersPerMonth,
    missingCostUnits: now.missingCostUnits,
    syncing: syncJobs.some((job) => job.status === "RUNNING"),
    syncFailed: syncJobs.some((job) => job.status === "FAILED"),
    sync: syncJobs.map((job) => ({
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
    breakdown: [
      { label: "COGS", value: money(now.cogs) },
      { label: "Payment fees", value: money(now.paymentFees) },
      { label: "Shipping cost", value: money(now.shippingCost) },
      { label: "Ad spend", value: money(now.adSpend) },
      { label: "Expenses", value: money(now.expenses) },
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
    })),
  };
};

export default function Dashboard() {
  const data = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const loading = navigation.state !== "idle";
  const kpis = [
    ["Net profit", data.kpis.netProfit],
    ["Margin", data.kpis.margin],
    ["Revenue", data.kpis.revenue],
    ["COGS", data.kpis.cogs],
    ["Ad spend", data.kpis.adSpend],
    ["Fees", data.kpis.fees],
  ] as const;
  const more = [
    ["Shipping cost", data.kpis.shipping],
    ["Expenses", data.kpis.expenses],
    ["Orders", data.kpis.orders],
    ["MER", data.kpis.mer],
  ] as const;

  return (
    <s-page heading="Profit">
      <s-stack direction="block" gap="base">
        <DateRangePicker from={data.from} to={data.to} />
        {loading ? (
          <s-stack direction="inline" gap="small-200">
            <s-spinner accessibilityLabel="Loading profit" />
            <s-text color="subdued">Updating this range</s-text>
          </s-stack>
        ) : null}
        {data.missingCostUnits > 0 ? (
          <s-banner tone="warning" heading="Missing costs">
            <s-paragraph>
              {data.missingCostUnits} units sold without a cost.{" "}
              <s-link href="/app/costs?missing=1">Add product costs</s-link>
            </s-paragraph>
          </s-banner>
        ) : null}
        {data.historyDays <= 60 ? (
          <s-banner tone="info" heading="60-day history">
            <s-paragraph>
              Orders older than 60 days need the read_all_orders scope, which Shopify approves separately.
            </s-paragraph>
          </s-banner>
        ) : null}
        {data.plan === "STARTER" && data.monthOrders > data.orderCap ? (
          <s-banner tone="warning" heading="Starter order count">
            <s-paragraph>
              {data.monthOrders} orders this month. Starter keeps counting past 300 and does not charge per order.{" "}
              <s-link href="/app/billing">Compare plans</s-link>
            </s-paragraph>
          </s-banner>
        ) : null}
        {data.syncing ? (
          <s-banner tone="info" heading="Sync in progress">
            <s-paragraph>
              {data.sync.map((job) => `${job.kind} ${job.status} (${job.count})`).join(" · ")}
            </s-paragraph>
          </s-banner>
        ) : null}
        {data.syncFailed ? (
          <s-banner tone="critical" heading="A sync failed">
            <s-paragraph>
              {data.sync
                .filter((job) => job.status === "FAILED")
                .map((job) => `${job.kind}${job.error ? `: ${job.error}` : ""}`)
                .join(" · ")}{" "}
              <s-link href="/app/settings">Resync from settings</s-link>
            </s-paragraph>
          </s-banner>
        ) : null}
        {data.table.length === 0 && data.orderCount === 0 ? (
          <EmptyState
            heading="No orders yet"
            icon="chart-popular"
            body="Profit shows up after the first order sync. Add product costs so COGS is not zero."
            href="/app/costs"
            action="Add product costs"
          />
        ) : null}
        {data.table.length === 0 && data.orderCount > 0 ? (
          <EmptyState
            heading="Nothing in this range"
            icon="calendar"
            body="Orders exist, but none of them land in these dates. Try a wider range."
            href="?preset=30d"
            action="Show the last 30 days"
          />
        ) : null}
        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(180px, 1fr))" gap="base">
          {kpis.map(([label, kpi]) => (
            <KpiCard key={label} label={label} value={kpi.value} delta={kpi.text} tone={kpi.tone} hint="vs previous period" />
          ))}
        </s-grid>
        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(180px, 1fr))" gap="base">
          {more.map(([label, kpi]) => (
            <KpiCard key={label} label={label} value={kpi.value} delta={kpi.text} tone={kpi.tone} />
          ))}
        </s-grid>
        <s-section heading="Profit over time">
          <ProfitChartLoader points={data.chart} currency={data.currency} />
        </s-section>
        <s-section heading="Cost breakdown">
          <s-paragraph>Costs subtracted from revenue in this range. Amounts are in {data.currency}.</s-paragraph>
          <s-table>
            <s-table-header-row>
              <s-table-header>Cost</s-table-header>
              <s-table-header>Amount</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {data.breakdown.map((row) => (
                <s-table-row key={row.label}>
                  <s-table-cell>{row.label}</s-table-cell>
                  <s-table-cell>{row.value}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        </s-section>
        <s-section heading="Daily P&L">
          {data.table.length === 0 ? (
            <s-paragraph>The daily table fills in after orders are imported.</s-paragraph>
          ) : (
            <s-table>
              <s-table-header-row>
                <s-table-header>Date</s-table-header>
                <s-table-header>Orders</s-table-header>
                <s-table-header>Revenue</s-table-header>
                <s-table-header>COGS</s-table-header>
                <s-table-header>Fees</s-table-header>
                <s-table-header>Ad spend</s-table-header>
                <s-table-header>Expenses</s-table-header>
                <s-table-header>Net profit</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {data.table.map((row) => (
                  <s-table-row key={row.date}>
                    <s-table-cell>{row.date}</s-table-cell>
                    <s-table-cell>{row.orders}</s-table-cell>
                    <s-table-cell>{row.revenue}</s-table-cell>
                    <s-table-cell>{row.cogs}</s-table-cell>
                    <s-table-cell>{row.fees}</s-table-cell>
                    <s-table-cell>{row.adSpend}</s-table-cell>
                    <s-table-cell>{row.expenses}</s-table-cell>
                    <s-table-cell>{row.netProfit}</s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          )}
          <s-paragraph>
            Margin and MER use the sums of this range, not an average of daily ratios. Tax, duties, tips, and gift card sales stay out of revenue.
          </s-paragraph>
        </s-section>
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
