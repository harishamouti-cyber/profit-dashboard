import { Link } from "react-router";
import { Icon, type IconName } from "./ui";

const ICON_MAP: Record<string, IconName> = {
  "chart-popular": "chart",
  product: "box",
  "cash-dollar": "wallet",
  "alert-triangle": "alert",
  calendar: "calendar",
};

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
  href?: string;
  action?: string;
}) {
  return (
    <div className="pd-empty">
      <div className="pd-empty-ico"><Icon name={ICON_MAP[icon] ?? "chart"} size={24} /></div>
      <h3>{heading}</h3>
      <p>{body}</p>
      {href && action ? (
        <Link to={href} className="pd-btn primary">
          {action}
          <span aria-hidden="true">→</span>
        </Link>
      ) : null}
    </div>
  );
}
