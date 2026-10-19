import { Icon, type IconName } from "./ui";

type DeltaTone = "success" | "critical" | "neutral" | "info" | "warning";

/**
 * KPI tile. `invert` flips the delta color for cost metrics, where a rise is bad.
 * Works inside PremiumPage (uses pd- classes).
 */
export function KpiCard({
  label,
  value,
  delta,
  tone = "neutral",
  hint = "vs previous period",
  icon,
  featured = false,
  invert = false,
  small = false,
}: {
  label: string;
  value: string;
  delta?: string | null;
  tone?: DeltaTone;
  hint?: string;
  icon?: IconName;
  featured?: boolean;
  invert?: boolean;
  small?: boolean;
}) {
  const shown: DeltaTone = invert ? (tone === "success" ? "critical" : tone === "critical" ? "success" : tone) : tone;
  // Arrow follows the raw direction; `invert` only changes the color.
  const up = tone === "success";
  const down = tone === "critical";
  return (
    <div className={`pd-card lift pd-kpi${featured ? " feat" : ""}${small ? " sm" : ""}`}>
      <div className="pd-kpi-l">
        <span>{label}</span>
        {icon && !small ? <span className="pd-ico"><Icon name={icon} size={14} /></span> : null}
      </div>
      <div className="pd-kpi-v">{value}</div>
      <div className="pd-kpi-f">
        {delta ? (
          <span className={`pd-pill ${shown}`}>
            {up ? <Icon name="trend" size={11} stroke={2.6} /> : down ? <span aria-hidden="true">↓</span> : null}
            {delta}
          </span>
        ) : null}
        {hint ? <span>{hint}</span> : null}
      </div>
    </div>
  );
}
