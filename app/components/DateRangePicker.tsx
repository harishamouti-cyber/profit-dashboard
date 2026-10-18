import { useNavigate } from "react-router";

const PRESETS = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["7d", "7d"],
  ["30d", "30d"],
  ["mtd", "MTD"],
  ["last_month", "Last month"],
] as const;

export function DateRangePicker({ from, to }: { from: string; to: string }) {
  const navigate = useNavigate();
  return (
    <s-stack direction="block" gap="base">
      <s-button-group>
        {PRESETS.map(([preset, label]) => (
          <s-button key={preset} href={`?preset=${preset}`} variant="tertiary">
            {label}
          </s-button>
        ))}
      </s-button-group>
      <s-date-picker
        type="range"
        name="range"
        value={`${from}--${to}`}
        onChange={(event) => {
          const value = event.currentTarget.value ?? "";
          const [start, end] = value.split("--");
          if (start && end && !end.endsWith("-") && end.length >= 10) {
            navigate(`?from=${start}&to=${end.slice(0, 10)}`);
          }
        }}
      />
    </s-stack>
  );
}
