import { PremiumPage } from "../components/ui";
import { DateRangePicker } from "../components/DateRangePicker";
import { KpiCard } from "../components/KpiCard";
import { ProfitChartLoader } from "../components/ProfitChartLoader";

const chart = [
  { date: "2026-10-05", revenue: 420, netProfit: 110 },
  { date: "2026-10-06", revenue: 510, netProfit: 140 },
  { date: "2026-10-07", revenue: 380, netProfit: 90 },
  { date: "2026-10-08", revenue: 640, netProfit: 180 },
  { date: "2026-10-09", revenue: 590, netProfit: 150 },
  { date: "2026-10-10", revenue: 720, netProfit: 210 },
  { date: "2026-10-11", revenue: 680, netProfit: 190 },
];

export default function PreviewDashboard() {
  return (
    <s-page heading="Profit">
      <PremiumPage>
      <s-stack direction="block" gap="base">
        <DateRangePicker from="2026-10-05" to="2026-10-11" />
        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(180px, 1fr))" gap="base">
          <KpiCard featured label="Net profit" value="$1,070.00" delta="+12.4%" tone="success" hint="vs previous period" />
          <KpiCard label="Margin" value="27.1%" delta="+1.8%" tone="success" hint="vs previous period" />
          <KpiCard label="Revenue" value="$3,940.00" delta="+6.2%" tone="success" hint="vs previous period" />
          <KpiCard label="COGS" value="$1,420.00" delta="+4.1%" tone="success" invert hint="vs previous period" />
          <KpiCard label="Ad spend" value="$640.00" delta="-3.0%" tone="critical" invert hint="vs previous period" />
          <KpiCard label="Fees" value="$148.00" delta="+2.2%" tone="success" invert hint="vs previous period" />
        </s-grid>
        <s-section heading="Profit over time">
          <ProfitChartLoader points={chart} currency="USD" />
        </s-section>
        <s-section heading="Cost breakdown">
          <s-table>
            <s-table-header-row>
              <s-table-header>Cost</s-table-header>
              <s-table-header>Amount</s-table-header>
            </s-table-header-row>
            <s-table-body>
              <s-table-row><s-table-cell>COGS</s-table-cell><s-table-cell>$1,420.00</s-table-cell></s-table-row>
              <s-table-row><s-table-cell>Payment fees</s-table-cell><s-table-cell>$148.00</s-table-cell></s-table-row>
              <s-table-row><s-table-cell>Shipping cost</s-table-cell><s-table-cell>$210.00</s-table-cell></s-table-row>
              <s-table-row><s-table-cell>Ad spend</s-table-cell><s-table-cell>$640.00</s-table-cell></s-table-row>
              <s-table-row><s-table-cell>Expenses</s-table-cell><s-table-cell>$452.00</s-table-cell></s-table-row>
            </s-table-body>
          </s-table>
        </s-section>
      </s-stack>
      </PremiumPage>
    </s-page>
  );
}
