export function KpiCard({
  label,
  value,
  delta,
  tone = "neutral",
}: {
  label: string;
  value: string;
  delta?: string | null;
  tone?: "success" | "critical" | "neutral" | "info";
}) {
  return (
    <s-section heading={label}>
      <s-stack direction="block" gap="base">
        <s-heading>{value}</s-heading>
        {delta ? <s-badge tone={tone}>{delta}</s-badge> : <s-text color="subdued">vs previous period</s-text>}
      </s-stack>
    </s-section>
  );
}
