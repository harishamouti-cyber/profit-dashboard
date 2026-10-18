import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { CsvDropZone } from "../components/CsvDropZone";
import { SaveToast } from "../components/SaveToast";
import { UpgradeCard } from "../components/UpgradeCard";
import { Card, Field, PageHeader, PremiumPage, RouteErrorBoundary } from "../components/ui";
import db from "../db.server";
import { enqueue } from "../jobs/queue.server";
import { parseAdSpendCsv } from "../lib/csv";
import { D, fmt, isMoney } from "../lib/money";
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
  const channels = [...new Set(rows.map((row) => row.channel))].sort();
  const totals = new Map<string, ReturnType<typeof D>>();
  for (const row of rows) totals.set(row.channel, (totals.get(row.channel) ?? D(0)).plus(D(row.amount)));
  const grand = rows.reduce((acc, row) => acc.plus(D(row.amount)), D(0));
  return {
    channelTotals: Object.fromEntries([...totals.entries()].map(([channel, value]) => [channel, fmt(value, shop.currencyCode)])),
    grandTotal: fmt(grand, shop.currencyCode),
    hasRows: rows.length > 0,
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
    if (dates.length > 0) await enqueue({ shopDomain: shop.shopDomain, type: "rebuild_days", payload: { dates } });
    return {
      message: parsed.rows.length > 0 ? `Saved ${parsed.rows.length} rows. The dashboard updates in a few seconds.` : "No rows were imported.",
      errors: parsed.errors.slice(0, 20).map((error) => `Row ${error.row}: ${error.message}`),
    };
  }
  const date = String(form.get("date") ?? "");
  const channel = String(form.get("channel") ?? "").trim().toLowerCase();
  const amount = String(form.get("amount") ?? "0");
  if (!isIsoDay(date) || !channel || channel.length > 40 || !isMoney(amount) || D(amount).isNegative()) {
    return { message: "Date (YYYY-MM-DD), channel, and a numeric amount are required.", errors: ["Date (YYYY-MM-DD), channel, and a numeric amount are required."] };
  }
  await db.adSpend.upsert({
    where: { shopId_date_channel: { shopId: shop.id, date: toDbDate(date), channel } },
    create: { shopId: shop.id, date: toDbDate(date), channel, amount, source: "MANUAL" },
    update: { amount, source: "MANUAL" },
  });
  await enqueue({ shopDomain: shop.shopDomain, type: "rebuild_days", payload: { dates: [date] } });
  return { message: `Saved ${fmt(amount, shop.currencyCode)} for ${channel} on ${date}.` };
};

const CHANNELS = ["meta", "google", "tiktok", "pinterest", "snapchat", "other"];

function label(channel: string) {
  return channel.charAt(0).toUpperCase() + channel.slice(1);
}

function fmtDay(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export default function AdSpendPage() {
  const data = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  const saving = navigation.state === "submitting" && navigation.formData?.get("intent") !== "import_csv";
  const cellFor = new Map(data.rows.map((row) => [`${row.date}|${row.channel}`, row.display]));
  return (
    <s-page heading="Ad spend">
      <PremiumPage>
        <PageHeader
          eyebrow="Ad spend"
          icon="megaphone"
          title="Every ad dollar, counted"
          subtitle={`Add what you spend on each channel per day. All spend counts against profit, with no attribution guesswork. Amounts in ${data.currency}.`}
        />
        <SaveToast message={result?.message} errors={result && "errors" in result ? result.errors : []} />

        <div className="pd-grid pd-g2">
          <Card title="Add spend" icon="megaphone" subtitle="Saving the same day and channel again replaces the amount">
            <Form method="post" className="pd-form">
              <input type="hidden" name="intent" value="save" />
              <Field label="Date">
                <input className="pd-input" type="date" name="date" defaultValue={data.today} max={data.today} required />
              </Field>
              <Field label="Channel">
                <input className="pd-input" name="channel" list="pd-channels" defaultValue="meta" required maxLength={40} />
                <datalist id="pd-channels">
                  {CHANNELS.map((channel) => <option key={channel} value={channel} />)}
                </datalist>
              </Field>
              <Field label={`Amount (${data.currency})`}>
                <input className="pd-input" name="amount" type="number" step="0.01" min="0" required placeholder="0.00" />
              </Field>
              <div className="pd-form-actions">
                <button type="submit" className="pd-btn primary" disabled={saving}>{saving ? "Saving…" : "Save spend"}</button>
              </div>
            </Form>
          </Card>
          <Card
            title="Import from CSV"
            icon="upload"
            subtitle={<>Use <span className="pd-code">date</span> <span className="pd-code">channel</span> <span className="pd-code">amount</span>, or upload a Meta or Google Ads export as-is.</>}
          >
            {data.canCsv ? (
              <CsvDropZone intent="import_csv" label="Drop an ad spend CSV" />
            ) : (
              <UpgradeCard feature="Upload Meta and Google Ads exports instead of typing each day. Manual entry stays free on Starter." />
            )}
          </Card>
        </div>

        <Card
          flush
          title="Last 14 days"
          icon="calendar"
          subtitle={data.hasRows ? `Total ${data.grandTotal}` : "Nothing saved yet. Add your first day above."}
        >
          <div className="pd-table-wrap">
            <table className="pd-table">
              <thead>
                <tr>
                  <th>Date</th>
                  {data.channels.map((channel) => <th key={channel} className="r">{label(channel)}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.days.slice().reverse().map((date) => (
                  <tr key={date}>
                    <td className="strong">{fmtDay(date)}</td>
                    {data.channels.map((channel) => {
                      const value = cellFor.get(`${date}|${channel}`);
                      return <td key={channel} className={`r${value ? "" : " pd-muted"}`}>{value ?? "—"}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
              {data.hasRows ? (
                <tfoot>
                  <tr>
                    <td className="strong" style={{ borderTop: "1px solid var(--line)" }}>14-day total</td>
                    {data.channels.map((channel) => (
                      <td key={channel} className="r strong" style={{ borderTop: "1px solid var(--line)" }}>{data.channelTotals[channel] ?? "—"}</td>
                    ))}
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </Card>
      </PremiumPage>
    </s-page>
  );
}

export const ErrorBoundary = RouteErrorBoundary;

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
