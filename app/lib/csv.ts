import { parse } from "csv-parse/sync";
import { z } from "zod";
import { D } from "./money";

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

function records(text: string): Array<Record<string, string>> {
  const parsed = parse(text, {
    columns: (header: string[]) => header.map((column) => column.trim().toLowerCase()),
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    bom: true,
  }) as Array<Record<string, string>>;
  return parsed;
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
  let index = 1;
  for (const record of records(text)) {
    index += 1;
    const sku = cell(record, ["sku", "variant sku"]);
    const costRaw = cell(record, ["unit_cost", "unit cost", "cost"]);
    const effective = cell(record, ["effective_from", "effective from", "date"]) || "1970-01-01";
    if (!sku) {
      errors.push({ row: index, message: "sku is required" });
      continue;
    }
    const cost = z.string().regex(/^-?\d+(\.\d+)?$/).safeParse(costRaw);
    const day = isoDay.safeParse(effective);
    if (!cost.success) {
      errors.push({ row: index, message: "unit_cost must be a number" });
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
  const parsed = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    bom: true,
  }) as Array<Record<string, string>>;

  let index = 1;
  for (const original of parsed) {
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
    const day = isoDay.safeParse(dateRaw);
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
  let index = 1;
  for (const record of records(text)) {
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
