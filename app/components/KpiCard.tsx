export function KpiCard({
  label,
  value,
  delta,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: string;
  delta?: string | null;
  tone?: "success" | "critical" | "neutral" | "info" | "warning";
  hint?: string;
}) {
  return (
    <s-section heading={label}>
      <s-stack direction="block" gap="small-200">
        <s-heading>{value}</s-heading>
        {delta ? <s-badge tone={tone}>{delta}</s-badge> : <s-text color="subdued">vs previous period</s-text>}
        {hint ? <s-text color="subdued">{hint}</s-text> : null}
      </s-stack>
    </s-section>
  );
}
