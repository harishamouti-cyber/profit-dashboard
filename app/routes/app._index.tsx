import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { DateRangePicker } from "../components/DateRangePicker";
import { KpiCard } from "../components/KpiCard";
import { ProfitChartLoader } from "../components/ProfitChartLoader";
import db from "../db.server";
import { periodDelta } from "../lib/delta";
import { D, fmt, fmtMultiple, fmtRatio, sum } from "../lib/money";
import { getPlanLimits } from "../lib/plan.server";
import { ratiosFromSums } from "../lib/profit/daily";
import { requireShop } from "../lib/shop.server";
import { fromDbDate, presetRange, previousPeriod, startOfMonth, todayInZone, toDbDate, type RangePreset } from "../lib/tz";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireShop(request);
  const url = new URL(request.url);
  const today = todayInZone(shop.ianaTimezone);
  const preset = url.searchParams.get("preset") as RangePreset | null;
  const ranged = preset ? presetRange(preset, today) : null;
  const from = ranged?.from ?? url.searchParams.get("from") ?? presetRange("30d", today).from;
  const to = ranged?.to ?? url.searchParams.get("to") ?? today;
  const previous = previousPeriod(from, to);
  const [current, prior, syncJobs, monthOrders] = await Promise.all([
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
      take: 3,
    }),
    db.order.count({
      where: {
        shopId: shop.id,
        test: false,
        localDate: { gte: toDbDate(startOfMonth(today)), lte: toDbDate(today) },
      },
    }),
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
  const ratios = ratiosFromSums(current.map((row) => ({
    revenue: D(row.revenue),
    netProfit: D(row.netProfit),
    grossProfit: D(row.grossProfit),
    adSpend: D(row.adSpend),
  })));
  const limits = getPlanLimits(shop.plan);
  return {
    from,
    to,
    currency: shop.currencyCode,
    historyDays: shop.historyDays,
    plan: shop.plan,
    monthOrders,
    orderCap: limits.ordersPerMonth,
    missingCostUnits: now.missingCostUnits,
    sync: syncJobs.map((job) => ({ kind: job.kind, status: job.status, count: job.objectCount })),
    kpis: {
      revenue: { value: fmt(now.revenue, shop.currencyCode), ...periodDelta(now.revenue, then.revenue) },
      netProfit: { value: fmt(now.netProfit, shop.currencyCode), ...periodDelta(now.netProfit, then.netProfit) },
      margin: { value: fmtRatio(ratios.margin), ...periodDelta(ratios.margin ?? D(0), then.revenue.isZero() ? D(0) : then.netProfit.div(then.revenue)) },
      cogs: { value: fmt(now.cogs, shop.currencyCode), ...periodDelta(now.cogs, then.cogs) },
      adSpend: { value: fmt(now.adSpend, shop.currencyCode), ...periodDelta(now.adSpend, then.adSpend) },
      mer: { value: fmtMultiple(ratios.mer), text: "from range sums", tone: "neutral" as const },
      fees: { value: fmt(now.paymentFees, shop.currencyCode), ...periodDelta(now.paymentFees, then.paymentFees) },
      shipping: { value: fmt(now.shippingCost, shop.currencyCode), ...periodDelta(now.shippingCost, then.shippingCost) },
      expenses: { value: fmt(now.expenses, shop.currencyCode), ...periodDelta(now.expenses, then.expenses) },
      orders: { value: String(now.orders), ...periodDelta(D(now.orders), D(then.orders)) },
    },
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
  const kpis = [
    ["Revenue", data.kpis.revenue],
    ["Net profit", data.kpis.netProfit],
    ["Margin", data.kpis.margin],
    ["COGS", data.kpis.cogs],
    ["Ad spend", data.kpis.adSpend],
    ["MER", data.kpis.mer],
    ["Fees", data.kpis.fees],
    ["Shipping cost", data.kpis.shipping],
    ["Expenses", data.kpis.expenses],
    ["Orders", data.kpis.orders],
  ] as const;

  return (
    <s-page heading="Profit">
      <s-stack direction="block" gap="base">
        <DateRangePicker from={data.from} to={data.to} />
        {data.missingCostUnits > 0 ? (
          <s-banner tone="warning" heading="Missing costs">
            <s-paragraph>
              {data.missingCostUnits} units sold without a cost.{" "}
              <s-link href="/app/costs?missing=1">Fix costs</s-link>
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
        {data.sync.some((job) => job.status === "RUNNING") ? (
          <s-banner tone="info" heading="Sync in progress">
            <s-paragraph>
              {data.sync.map((job) => `${job.kind} ${job.status} (${job.count})`).join(" · ")}
            </s-paragraph>
          </s-banner>
        ) : null}
        <s-grid gridTemplateColumns="repeat(5, minmax(0, 1fr))" gap="base">
          {kpis.map(([label, kpi]) => (
            <KpiCard key={label} label={label} value={kpi.value} delta={"text" in kpi ? kpi.text : undefined} tone={kpi.tone} />
          ))}
        </s-grid>
        <s-section heading="Net profit and revenue">
          <ProfitChartLoader points={data.chart} />
        </s-section>
        <s-section heading="Daily P&L">
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
          <s-paragraph>
            Margin and MER are computed from the sums of this range, not by averaging daily ratios. Tax, duties, tips, and gift card sales are excluded from revenue.
          </s-paragraph>
        </s-section>
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
