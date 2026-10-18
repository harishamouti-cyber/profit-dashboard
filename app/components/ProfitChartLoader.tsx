import { useEffect, useState } from "react";
import type { ProfitChart } from "./ProfitChart.client";
import { Skeleton } from "./ui";

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
  if (points.length === 0) return <p className="pd-muted">No daily totals in this range yet.</p>;
  if (!Chart) return <Skeleton height={290} />;
  return <Chart points={points} currency={currency} />;
}
