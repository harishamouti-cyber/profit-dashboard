import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

function short(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(Math.round(value));
}

export function ProfitChart({
  points,
  currency,
}: {
  points: Array<{ date: string; revenue: number; netProfit: number }>;
  currency: string;
}) {
  if (points.length === 0) {
    return <p className="pd-muted">No daily totals in this range yet.</p>;
  }
  return (
    <div style={{ width: "100%", height: 290 }}>
      <ResponsiveContainer>
        <ComposedChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="pdBar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.95} />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.75} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#eef0f4" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#5c6170" }} tickLine={false} axisLine={false} tickFormatter={(d: string) => d.slice(5)} minTickGap={16} />
          <YAxis tick={{ fontSize: 11, fill: "#5c6170" }} tickLine={false} axisLine={false} width={44} tickFormatter={short} />
          <Tooltip
            cursor={{ fill: "rgba(79,70,229,.06)" }}
            contentStyle={{ borderRadius: 12, border: "1px solid #e6e8ee", boxShadow: "0 10px 30px -12px rgba(16,24,40,.25)", fontFamily: "Inter, system-ui, sans-serif", fontSize: 12 }}
            formatter={(value) => [`${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`, undefined]}
          />
          <Bar dataKey="netProfit" name="Net profit" fill="url(#pdBar)" radius={[6, 6, 2, 2]} maxBarSize={28} />
          <Line dataKey="revenue" name="Revenue" stroke="#0b0d12" strokeWidth={2} dot={false} activeDot={{ r: 4 }} type="monotone" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
