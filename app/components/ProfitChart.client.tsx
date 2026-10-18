import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function ProfitChart({
  points,
  currency,
}: {
  points: Array<{ date: string; revenue: number; netProfit: number }>;
  currency: string;
}) {
  if (points.length === 0) {
    return <s-paragraph>No daily totals in this range yet.</s-paragraph>;
  }
  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer>
        <ComposedChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#e3e3e3" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={48} />
          <Tooltip formatter={(value) => [`${value} ${currency}`, undefined]} />
          <Legend />
          <Bar dataKey="netProfit" name="Net profit" fill="#008060" radius={[4, 4, 0, 0]} />
          <Line dataKey="revenue" name="Revenue" stroke="#202223" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
