import type { LoaderFunctionArgs } from "react-router";
import db from "../db.server";
import { D } from "../lib/money";
import { getPlanLimits } from "../lib/plan.server";
import { requireShop } from "../lib/shop.server";
import { fromDbDate, safeRange, todayInZone, toDbDate } from "../lib/tz";

function csvEscape(value: string | number): string {
  let text = String(value);
  // Block spreadsheet formula injection from product titles; plain numbers stay as-is.
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { shop } = await requireShop(request);
  if (!getPlanLimits(shop.plan).csvExport) {
    return new Response("CSV export requires Growth or Pro", { status: 402 });
  }
  const url = new URL(request.url);
  const today = todayInZone(shop.ianaTimezone);
  // Invalid or missing dates fall back to the last 30 days instead of crashing the query.
  const { from, to } = safeRange(
    { preset: url.searchParams.get("preset"), from: url.searchParams.get("from"), to: url.searchParams.get("to") },
    today,
  );
  const kind = params.kind;
  if (kind === "pnl") {
    const rows = await db.dailyMetric.findMany({
      where: { shopId: shop.id, date: { gte: toDbDate(from), lte: toDbDate(to) } },
      orderBy: { date: "asc" },
    });
    const header = ["date", "orders", "revenue", "cogs", "fees", "ad_spend", "expenses", "net_profit"];
    const lines = rows.map((row) =>
      [fromDbDate(row.date), row.orders, D(row.revenue).toFixed(2), D(row.cogs).toFixed(2), D(row.paymentFees).toFixed(2), D(row.adSpend).toFixed(2), D(row.expenses).toFixed(2), D(row.netProfit).toFixed(2)]
        .map(csvEscape)
        .join(","),
    );
    return new Response([header.join(","), ...lines].join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=\"pnl.csv\"",
      },
    });
  }
  if (kind === "products") {
    const rows = await db.productDailyMetric.findMany({
      where: { shopId: shop.id, date: { gte: toDbDate(from), lte: toDbDate(to) } },
    });
    const variants = await db.variant.findMany({ where: { shopId: shop.id }, select: { productGid: true, productTitle: true } });
    const titles = new Map<string, string>();
    for (const variant of variants) if (!titles.has(variant.productGid)) titles.set(variant.productGid, variant.productTitle);
    const header = ["product", "product_gid", "units_sold", "units_returned", "net_sales", "cogs", "allocated_fees", "gross_profit"];
    const grouped = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = grouped.get(row.productGid) ?? [];
      list.push(row);
      grouped.set(row.productGid, list);
    }
    const lines = [...grouped.entries()].map(([productGid, list]) => {
      const net = list.reduce((acc, row) => acc.plus(D(row.netSales)), D(0));
      const cogs = list.reduce((acc, row) => acc.plus(D(row.cogs)), D(0));
      const fees = list.reduce((acc, row) => acc.plus(D(row.allocatedFees)), D(0));
      const profit = list.reduce((acc, row) => acc.plus(D(row.grossProfit)), D(0));
      const sold = list.reduce((acc, row) => acc + row.unitsSold, 0);
      const returned = list.reduce((acc, row) => acc + row.unitsReturned, 0);
      return [titles.get(productGid) ?? "", productGid, sold, returned, net.toFixed(2), cogs.toFixed(2), fees.toFixed(2), profit.toFixed(2)].map(csvEscape).join(",");
    });
    return new Response([header.join(","), ...lines].join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=\"products.csv\"",
      },
    });
  }
  return new Response("Unknown export", { status: 404 });
};
