import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { CsvDropZone } from "../components/CsvDropZone";
import { SaveToast } from "../components/SaveToast";
import { UpgradeCard } from "../components/UpgradeCard";
import db from "../db.server";
import { enqueue } from "../jobs/queue.server";
import { parseAdSpendCsv } from "../lib/csv";
import { fmt, isMoney } from "../lib/money";
import { getPlanLimits } from "../lib/plan.server";
import { requireShop } from "../lib/shop.server";
import { addDays, eachDay, fromDbDate, isIsoDay, todayInZone, toDbDate } from "../lib/tz";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireShop(request);
  const today = todayInZone(shop.ianaTimezone);
  const from = addDays(today, -13);
  const rows = await db.adSpend.findMany({
    where: { shopId: shop.id, date: { gte: toDbDate(from), lte: toDbDate(today) } },
    orderBy: { date: "desc" },
  });
  const channels = [...new Set(rows.map((row) => row.channel))];
  return {
    today,
    from,
    days: eachDay(from, today),
    channels: channels.length ? channels : ["meta", "google"],
    rows: rows.map((row) => ({
      date: fromDbDate(row.date),
      channel: row.channel,
      amount: row.amount.toString(),
      display: fmt(row.amount, shop.currencyCode),
    })),
    canCsv: getPlanLimits(shop.plan).adSpendCsv,
    currency: shop.currencyCode,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await requireShop(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "save");
  if (intent === "import_csv") {
    if (!getPlanLimits(shop.plan).adSpendCsv) {
      return { message: "Ad spend CSV import is on Growth and Pro." };
    }
    const parsed = parseAdSpendCsv(String(form.get("csv") ?? ""));
    for (const row of parsed.rows) {
      await db.adSpend.upsert({
        where: { shopId_date_channel: { shopId: shop.id, date: toDbDate(row.date), channel: row.channel } },
        create: { shopId: shop.id, date: toDbDate(row.date), channel: row.channel, amount: row.amount, source: "CSV" },
        update: { amount: row.amount, source: "CSV" },
      });
    }
    const dates = [...new Set(parsed.rows.map((row) => row.date))];
    await enqueue({ shopDomain: shop.shopDomain, type: "rebuild_days", payload: { dates } });
    return {
      message: `Saved ${parsed.rows.length} rows.`,
      errors: parsed.errors.map((error) => `Row ${error.row}: ${error.message}`),
    };
  }
  const date = String(form.get("date") ?? "");
  const channel = String(form.get("channel") ?? "").trim().toLowerCase();
  const amount = String(form.get("amount") ?? "0");
  if (!isIsoDay(date) || !channel || !isMoney(amount)) {
    return { message: "Date (YYYY-MM-DD), channel, and a numeric amount are required.", errors: ["Date (YYYY-MM-DD), channel, and a numeric amount are required."] };
  }
  await db.adSpend.upsert({
    where: { shopId_date_channel: { shopId: shop.id, date: toDbDate(date), channel } },
    create: { shopId: shop.id, date: toDbDate(date), channel, amount, source: "MANUAL" },
    update: { amount, source: "MANUAL" },
  });
  await enqueue({ shopDomain: shop.shopDomain, type: "rebuild_days", payload: { dates: [date] } });
  return { message: `Saved ${channel} on ${date}.` };
};

export default function AdSpendPage() {
  const data = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return (
    <s-page heading="Ad spend">
      <s-stack direction="block" gap="base">
        <s-paragraph>
          Every channel counts. Nothing is filtered by attribution. Amounts are in {data.currency}.
        </s-paragraph>
        <SaveToast message={result?.message} errors={result && "errors" in result ? result.errors : []} />
        <s-section heading="Add spend">
          <Form method="post">
            <s-date-field label="Date" name="date" value={data.today} />
            <s-text-field label="Channel" name="channel" value="meta" />
            <s-number-field label="Amount" name="amount" />
            <s-button type="submit" variant="primary">Save</s-button>
          </Form>
        </s-section>
        {data.canCsv ? (
          <s-section heading="CSV">
            <s-paragraph>Headers: date, channel, amount. Also accepts Day, Reporting starts, Amount spent (USD), and Cost.</s-paragraph>
            <CsvDropZone intent="import_csv" label="Drop an ad spend CSV" />
          </s-section>
        ) : (
          <UpgradeCard feature="Ad spend CSV import is on Growth and Pro. Manual entry stays on Starter." />
        )}
        <s-table>
          <s-table-header-row>
            <s-table-header>Date</s-table-header>
            {data.channels.map((channel) => (
              <s-table-header key={channel}>{channel}</s-table-header>
            ))}
          </s-table-header-row>
          <s-table-body>
            {data.days.slice().reverse().map((date) => (
              <s-table-row key={date}>
                <s-table-cell>{date}</s-table-cell>
                {data.channels.map((channel) => {
                  const cell = data.rows.find((row) => row.date === date && row.channel === channel);
                  return <s-table-cell key={channel}>{cell?.display ?? "—"}</s-table-cell>;
                })}
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
