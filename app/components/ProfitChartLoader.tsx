import { useEffect, useState } from "react";
import type { ProfitChart } from "./ProfitChart.client";

type ChartComponent = typeof ProfitChart;

export function ProfitChartLoader({
  points,
  currency,
}: {
  points: Array<{ date: string; revenue: number; netProfit: number }>;
  currency: string;
}) {
  const [Chart, setChart] = useState<ChartComponent | null>(null);
  useEffect(() => {
    let active = true;
    void import("./ProfitChart.client").then((module) => {
      if (active) setChart(() => module.ProfitChart);
    });
    return () => {
      active = false;
    };
  }, []);
  if (points.length === 0) return <s-paragraph>No daily totals in this range yet.</s-paragraph>;
  if (!Chart) {
    return (
      <s-stack direction="inline" gap="small-200">
        <s-spinner accessibilityLabel="Loading chart" />
        <s-text color="subdued">Loading chart</s-text>
      </s-stack>
    );
  }
  return <Chart points={points} currency={currency} />;
}
