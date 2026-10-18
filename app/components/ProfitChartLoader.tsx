import { useEffect, useState } from "react";
import type { ProfitChart } from "./ProfitChart.client";

type ChartComponent = typeof ProfitChart;

export function ProfitChartLoader({
  points,
}: {
  points: Array<{ date: string; revenue: number; netProfit: number }>;
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
  if (!Chart) return <s-paragraph>Loading chart…</s-paragraph>;
  return <Chart points={points} />;
}
