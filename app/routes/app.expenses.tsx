import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { EmptyState } from "../components/EmptyState";
import { SaveToast } from "../components/SaveToast";
import { Card, Field, Icon, PageHeader, Pill, PremiumPage, RouteErrorBoundary } from "../components/ui";
import db from "../db.server";
import { enqueue } from "../jobs/queue.server";
import { D, fmt, isMoney } from "../lib/money";
import { dailyShare } from "../lib/profit/expenses";
import { getPlanLimits } from "../lib/plan.server";
import { requireShop } from "../lib/shop.server";
import { addDays, eachDay, fromDbDate, isIsoDay, todayInZone, toDbDate } from "../lib/tz";

const FREQUENCIES = ["ONE_TIME", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;

/** Days to rebuild after an expense change: the most recent 400 days of its span. */
function rebuildSpan(start: string, end: string): string[] {
  const last = end < start ? start : end;
  const floor = addDays(last, -399);
  return eachDay(start > floor ? start : floor, last);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireShop(request);
  const today = todayInZone(shop.ianaTimezone);
  const expenses = await db.expense.findMany({ where: { shopId: shop.id }, orderBy: { name: "asc" } });
  const limits = getPlanLimits(shop.plan);
  return {
    today,
    currency: shop.currencyCode,
    limit: limits.expenses,
    count: expenses.length,
    expenses: expenses.map((expense) => ({
      id: expense.id,
      name: expense.name,
      category: expense.category,
      amount: fmt(expense.amount, shop.currencyCode),
      ended: Boolean(expense.endDate && fromDbDate(expense.endDate) < today),
      frequency: expense.frequency,
      startDate: fromDbDate(expense.startDate),
      endDate: expense.endDate ? fromDbDate(expense.endDate) : "",
      daily: fmt(
        dailyShare(
          {
            amount: D(expense.amount),
            frequency: expense.frequency,
            startDate: fromDbDate(expense.startDate),
            endDate: expense.endDate ? fromDbDate(expense.endDate) : null,
          },
          today,
        ),
        shop.currencyCode,
      ),
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await requireShop(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "create");
  if (intent === "delete") {
    const id = String(form.get("id") ?? "");
    const existing = await db.expense.findFirst({ where: { id, shopId: shop.id } });
    await db.expense.deleteMany({ where: { id, shopId: shop.id } });
    if (existing) {
      const end = existing.endDate ? fromDbDate(existing.endDate) : todayInZone(shop.ianaTimezone);
      await enqueue({
        shopDomain: shop.shopDomain,
        type: "rebuild_days",
        payload: { dates: rebuildSpan(fromDbDate(existing.startDate), end) },
      });
    }
    return { message: "Expense removed." };
  }
  const limits = getPlanLimits(shop.plan);
  const count = await db.expense.count({ where: { shopId: shop.id } });
  if (intent === "create" && count >= limits.expenses) {
    return { message: `Your plan includes ${limits.expenses} expenses. Upgrade for unlimited expenses.`, errors: [`Your plan includes ${limits.expenses} expenses. Upgrade for unlimited expenses.`] };
  }
  const name = String(form.get("name") ?? "").trim();
  const category = String(form.get("category") ?? "other");
  const amount = String(form.get("amount") ?? "");
  const frequency = String(form.get("frequency") ?? "MONTHLY");
  const startDate = String(form.get("startDate") ?? "");
  const endDate = String(form.get("endDate") ?? "");
  if (!name || name.length > 120 || !isMoney(amount) || D(amount).isNegative() || !isIsoDay(startDate)) {
    return { message: "Name, a numeric amount, and a start date (YYYY-MM-DD) are required.", errors: ["Name, a numeric amount, and a start date (YYYY-MM-DD) are required."] };
  }
  const data = {
    name,
    category,
    amount,
    frequency: FREQUENCIES.includes(frequency as (typeof FREQUENCIES)[number]) ? (frequency as (typeof FREQUENCIES)[number]) : "MONTHLY",
    startDate: toDbDate(startDate),
    endDate: isIsoDay(endDate) ? toDbDate(endDate) : null,
  };
  if (data.endDate && endDate < startDate) {
    return { message: "The end date must be on or after the start date.", errors: ["The end date must be on or after the start date."] };
  }
  const id = String(form.get("id") ?? "");
  if (intent === "update" && id) {
    await db.expense.updateMany({ where: { id, shopId: shop.id }, data });
  } else {
    await db.expense.create({ data: { shopId: shop.id, ...data } });
  }
  const end = data.endDate ? endDate : todayInZone(shop.ianaTimezone);
  await enqueue({
    shopDomain: shop.shopDomain,
    type: "rebuild_days",
    payload: { dates: rebuildSpan(startDate, end) },
  });
  return { message: "Expense saved. Daily share is amount divided by the period length." };
};

const FREQ_LABEL: Record<(typeof FREQUENCIES)[number], string> = {
  ONE_TIME: "One time",
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  YEARLY: "Yearly",
};

const CATEGORIES = [
  ["apps", "Apps"],
  ["software", "Software"],
  ["staff", "Staff"],
  ["rent", "Rent"],
  ["marketing", "Marketing"],
  ["other", "Other"],
] as const;

export default function ExpensesPage() {
  const data = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  const intent = navigation.state === "submitting" ? String(navigation.formData?.get("intent") ?? "") : "";
  const deleting = intent === "delete" ? String(navigation.formData?.get("id") ?? "") : "";
  const limited = Number.isFinite(data.limit);
  const atLimit = limited && data.count >= data.limit;
  const used = limited && data.limit > 0 ? Math.min(100, Math.round((data.count / data.limit) * 100)) : 0;
  return (
    <s-page heading="Expenses">
      <PremiumPage>
        <PageHeader
          eyebrow="Expenses"
          icon="receipt"
          title="Fixed costs, spread fairly"
          subtitle={`Apps, staff, rent and other overheads are spread across each day so daily profit stays honest. Monthly costs use that month's length, so February is amount ÷ 28 or 29. Amounts in ${data.currency}.`}
          actions={
            limited ? (
              <div className="pd-card pd-meter" style={{ padding: "12px 16px" }}>
                <div className="pd-meter-top"><span>{data.count} of {data.limit} expenses used</span><Link to="/app/billing" style={{ fontWeight: 600, color: "var(--brand)" }}>Upgrade</Link></div>
                <div className="pd-bar"><i style={{ width: `${used}%` }} /></div>
              </div>
            ) : (
              <Pill tone="info">Unlimited expenses</Pill>
            )
          }
        />
        <SaveToast message={result?.message} errors={result && "errors" in result ? result.errors : []} />

        <Card title="Add an expense" icon="plus" subtitle="Example: Klaviyo, $150, Monthly">
          {atLimit ? (
            <div className="pd-upgrade">
              <div className="t">
                <span className="pd-ico"><Icon name="lock" size={15} /></span>
                <div><b>You&apos;ve used all {data.limit} expenses on your plan</b><p>Growth and Pro include unlimited expenses.</p></div>
              </div>
              <Link to="/app/billing" className="pd-btn primary sm"><Icon name="sparkle" size={13} />See plans</Link>
            </div>
          ) : (
            <Form method="post" className="pd-form" key={result && "message" in result && !("errors" in result) ? result.message : "form"}>
              <input type="hidden" name="intent" value="create" />
              <Field label="Name"><input className="pd-input" name="name" required maxLength={120} placeholder="e.g. Klaviyo" /></Field>
              <Field label="Category">
                <select className="pd-input" name="category" defaultValue="apps">
                  {CATEGORIES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                </select>
              </Field>
              <Field label={`Amount (${data.currency})`}><input className="pd-input" name="amount" type="number" step="0.01" min="0" required placeholder="0.00" /></Field>
              <Field label="Repeats">
                <select className="pd-input" name="frequency" defaultValue="MONTHLY">
                  {FREQUENCIES.map((frequency) => <option key={frequency} value={frequency}>{FREQ_LABEL[frequency]}</option>)}
                </select>
              </Field>
              <Field label="Start"><input className="pd-input" name="startDate" type="date" defaultValue={data.today} required /></Field>
              <Field label="End (optional)"><input className="pd-input" name="endDate" type="date" /></Field>
              <div className="pd-form-actions">
                <button type="submit" className="pd-btn primary" disabled={intent === "create"}>{intent === "create" ? "Saving…" : "Save expense"}</button>
              </div>
            </Form>
          )}
        </Card>

        <Card flush title="Your expenses" icon="receipt" subtitle="Today's share is what each expense subtracts from today's profit">
          {data.expenses.length === 0 ? (
            <EmptyState
              heading="No expenses yet"
              icon="cash-dollar"
              body="Add the monthly bills that keep your store running, like apps, software, and staff. They're spread across each day automatically."
            />
          ) : (
            <div className="pd-table-wrap">
              <table className="pd-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Category</th>
                    <th className="r">Amount</th>
                    <th>Repeats</th>
                    <th>Dates</th>
                    <th className="r">Today&apos;s share</th>
                    <th className="r" aria-label="Actions"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.expenses.map((expense) => (
                    <tr key={expense.id}>
                      <td className="strong">{expense.name}</td>
                      <td><Pill>{expense.category}</Pill></td>
                      <td className="r">{expense.amount}</td>
                      <td>{FREQ_LABEL[expense.frequency as (typeof FREQUENCIES)[number]] ?? expense.frequency}</td>
                      <td className="pd-muted pd-small">
                        {expense.startDate}{expense.endDate ? ` → ${expense.endDate}` : " → ongoing"}
                        {expense.ended ? <> <Pill>Ended</Pill></> : null}
                      </td>
                      <td className="r strong">{expense.daily}</td>
                      <td className="r">
                        <Form
                          method="post"
                          onSubmit={(event) => {
                            if (!window.confirm(`Delete ${expense.name}? Past days will be recalculated.`)) event.preventDefault();
                          }}
                        >
                          <input type="hidden" name="intent" value="delete" />
                          <input type="hidden" name="id" value={expense.id} />
                          <button type="submit" className="pd-btn danger sm" disabled={deleting === expense.id}>
                            <Icon name="trash" size={13} />{deleting === expense.id ? "Deleting…" : "Delete"}
                          </button>
                        </Form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </PremiumPage>
    </s-page>
  );
}

export const ErrorBoundary = RouteErrorBoundary;

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
