import { Form, Link, useSearchParams } from "react-router";
import { Icon } from "./ui";

const PRESETS = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["7d", "7 days"],
  ["30d", "30 days"],
  ["mtd", "Month to date"],
  ["last_month", "Last month"],
] as const;

/** Segmented presets plus a compact custom range. Other query params (search, sort) are kept. */
export function DateRangePicker({ from, to }: { from: string; to: string }) {
  const [params] = useSearchParams();
  const active = params.get("preset") ?? (params.get("from") || params.get("to") ? "" : "30d");
  const keep = [...params.entries()].filter(([key]) => key !== "preset" && key !== "from" && key !== "to");
  const hrefFor = (preset: string) => {
    const next = new URLSearchParams(keep);
    next.set("preset", preset);
    return `?${next.toString()}`;
  };
  return (
    <div className="pd-range">
      <nav className="pd-seg" aria-label="Date range">
        {PRESETS.map(([preset, label]) => (
          <Link key={preset} to={hrefFor(preset)} className={active === preset ? "on" : ""} preventScrollReset>
            {label}
          </Link>
        ))}
      </nav>
      <Form method="get" className="pd-dates" key={`${from}-${to}`} preventScrollReset>
        {keep.map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
        <Icon name="calendar" size={14} />
        <input className="pd-input" type="date" name="from" defaultValue={from} max={to} aria-label="From" required />
        <span>→</span>
        <input className="pd-input" type="date" name="to" defaultValue={to} aria-label="To" required />
        <button type="submit" className="pd-btn dark sm">Apply</button>
      </Form>
    </div>
  );
}
