export function EmptyState({
  heading,
  icon = "chart-popular",
  body,
  href,
  action,
}: {
  heading: string;
  icon?: "chart-popular" | "product" | "cash-dollar" | "alert-triangle" | "calendar";
  body: string;
  href: string;
  action: string;
}) {
  return (
    <s-section heading={heading}>
      <s-stack direction="block" gap="base">
        <s-icon type={icon} tone="info" />
        <s-paragraph>{body}</s-paragraph>
        <s-button href={href} variant="primary">{action}</s-button>
      </s-stack>
    </s-section>
  );
}
