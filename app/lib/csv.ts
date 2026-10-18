import { parse } from "csv-parse/sync";
import { z } from "zod";
import { D } from "./money";
import { isIsoDay } from "./tz";

export interface CsvRowError {
  row: number;
  message: string;
}

export interface ParsedCosts {
  rows: Array<{ sku: string; unitCost: string; effectiveFrom: string }>;
  errors: CsvRowError[];
}

export interface ParsedAdSpend {
  rows: Array<{ date: string; channel: string; amount: string }>;
  errors: CsvRowError[];
}

export interface ParsedShipping {
  rows: Array<{ orderName: string; amount: string }>;
  errors: CsvRowError[];
}

export const MAX_CSV_ROWS = 20_000;

/** Fatal message when none of the accepted names for a required column is in the header. */
function missingColumns(rows: Array<Record<string, string>>, required: Array<{ label: string; names: string[] }>): string | null {
  const header = new Set(Object.keys(rows[0] ?? {}).map((key) => key.trim().toLowerCase()));
  const missing = required.filter((column) => !column.names.some((name) => header.has(name)));
  if (missing.length === 0) return null;
  return `Missing column${missing.length > 1 ? "s" : ""}: ${missing.map((column) => column.label).join(", ")}. Check the header row.`;
}

function records(text: string): { rows: Array<Record<string, string>>; fatal: string | null } {
  if (!text.trim()) return { rows: [], fatal: "CSV is empty." };
  try {
    const parsed = parse(text, {
      columns: (header: string[]) => header.map((column) => column.trim().toLowerCase()),
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      bom: true,
    }) as Array<Record<string, string>>;
    if (parsed.length === 0) return { rows: [], fatal: "CSV has a header row but no data rows." };
    if (parsed.length > MAX_CSV_ROWS) {
      return { rows: [], fatal: `CSV has ${parsed.length} rows. The limit is ${MAX_CSV_ROWS.toLocaleString("en-US")} per file, so split it and upload each part.` };
    }
    return { rows: parsed, fatal: null };
  } catch {
    return { rows: [], fatal: "CSV could not be parsed. Check the header row and quotes." };
  }
}

function cell(row: Record<string, string>, names: string[]): string {
  for (const name of names) {
    const value = row[name];
    if (value != null && value !== "") return value;
  }
  return "";
}

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");

export function parseCostsCsv(text: string): ParsedCosts {
  const rows: ParsedCosts["rows"] = [];
  const errors: CsvRowError[] = [];
  const parsed = records(text);
  if (parsed.fatal) return { rows, errors: [{ row: 1, message: parsed.fatal }] };
  const headerError = missingColumns(parsed.rows, [
    { label: "sku", names: ["sku", "variant sku"] },
    { label: "unit_cost", names: ["unit_cost", "unit cost", "cost"] },
  ]);
  if (headerError) return { rows, errors: [{ row: 1, message: headerError }] };
  let index = 1;
  for (const record of parsed.rows) {
    index += 1;
    const sku = cell(record, ["sku", "variant sku"]);
    const costRaw = cell(record, ["unit_cost", "unit cost", "cost"]);
    const effective = cell(record, ["effective_from", "effective from", "date"]) || "1970-01-01";
    if (!sku) {
      errors.push({ row: index, message: "sku is required" });
      continue;
    }
    const cost = z.string().regex(/^\d+(\.\d+)?$/).safeParse(costRaw.replace(/[$,]/g, ""));
    const day = isoDay.refine(isIsoDay, "not a real date").safeParse(effective);
    if (!cost.success) {
      errors.push({ row: index, message: "unit_cost must be a positive number" });
      continue;
    }
    if (!day.success) {
      errors.push({ row: index, message: "effective_from must be YYYY-MM-DD" });
      continue;
    }
    rows.push({ sku, unitCost: D(cost.data).toFixed(4), effectiveFrom: day.data });
  }
  return { rows, errors };
}

/**
 * Accepts date,channel,amount plus Meta ("Day", "Amount spent (USD)") and
 * Google ("Day" / "Reporting starts", "Cost") headers. When the channel column
 * is absent, "amount spent" maps to meta and "cost" maps to google.
 */
export function parseAdSpendCsv(text: string): ParsedAdSpend {
  const rows: ParsedAdSpend["rows"] = [];
  const errors: CsvRowError[] = [];
  const parsed = records(text);
  if (parsed.fatal) return { rows, errors: [{ row: 1, message: parsed.fatal }] };
  const headerError = missingColumns(parsed.rows, [
    { label: "date", names: ["date", "day", "reporting starts"] },
    { label: "amount", names: ["amount", "amount spent (usd)", "amount spent", "cost"] },
  ]);
  if (headerError) return { rows, errors: [{ row: 1, message: headerError }] };

  let index = 1;
  for (const original of parsed.rows) {
    index += 1;
    const record: Record<string, string> = {};
    for (const [key, value] of Object.entries(original)) {
      record[key.trim().toLowerCase()] = value;
    }
    const dateRaw = cell(record, ["date", "day", "reporting starts"]);
    const amountRaw = cell(record, ["amount", "amount spent (usd)", "amount spent", "cost"]);
    let channel = cell(record, ["channel", "platform", "source"]).toLowerCase();
    if (!channel) {
      if (record["amount spent (usd)"] != null || record["amount spent"] != null) channel = "meta";
      else if (record.cost != null) channel = "google";
    }
    const day = isoDay.refine(isIsoDay, "not a real date").safeParse(dateRaw);
    const amount = z.string().regex(/^-?\d+(\.\d+)?$/).safeParse(amountRaw.replace(/[$,]/g, ""));
    if (!day.success) {
      errors.push({ row: index, message: "date must be YYYY-MM-DD" });
      continue;
    }
    if (!amount.success) {
      errors.push({ row: index, message: "amount must be a number" });
      continue;
    }
    if (!channel) {
      errors.push({ row: index, message: "channel is required" });
      continue;
    }
    rows.push({ date: day.data, channel, amount: D(amount.data).toFixed(4) });
  }
  return { rows, errors };
}

export function parseShippingCsv(text: string): ParsedShipping {
  const rows: ParsedShipping["rows"] = [];
  const errors: CsvRowError[] = [];
  const parsed = records(text);
  if (parsed.fatal) return { rows, errors: [{ row: 1, message: parsed.fatal }] };
  const headerError = missingColumns(parsed.rows, [
    { label: "order_name", names: ["order_name", "order name", "order", "name"] },
    { label: "amount", names: ["amount", "cost", "shipping_cost"] },
  ]);
  if (headerError) return { rows, errors: [{ row: 1, message: headerError }] };
  let index = 1;
  for (const record of parsed.rows) {
    index += 1;
    const orderName = cell(record, ["order_name", "order name", "order", "name"]);
    const amountRaw = cell(record, ["amount", "cost", "shipping_cost"]);
    const amount = z.string().regex(/^-?\d+(\.\d+)?$/).safeParse(amountRaw.replace(/[$,]/g, ""));
    if (!orderName) {
      errors.push({ row: index, message: "order_name is required" });
      continue;
    }
    if (!amount.success) {
      errors.push({ row: index, message: "amount must be a number" });
      continue;
    }
    rows.push({ orderName, amount: D(amount.data).toFixed(4) });
  }
  return { rows, errors };
}
