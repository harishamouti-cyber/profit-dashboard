export function UpgradeCard({
  feature,
  required = "Growth",
}: {
  feature: string;
  required?: string;
}) {
  return (
    <s-banner tone="warning" heading={`${required} plan`}>
      <s-paragraph>{feature}</s-paragraph>
      <s-link href="/app/billing">See plans. No per-order fees.</s-link>
    </s-banner>
  );
}
