import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { enqueue } from "../jobs/queue.server";
import { D, fmt } from "../lib/money";
import { dailyShare } from "../lib/profit/expenses";
import { getPlanLimits } from "../lib/plan.server";
import { requireShop } from "../lib/shop.server";
import { eachDay, fromDbDate, todayInZone, toDbDate } from "../lib/tz";

const FREQUENCIES = ["ONE_TIME", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;

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
        payload: { dates: eachDay(fromDbDate(existing.startDate), end).slice(0, 400) },
      });
    }
    return { message: "Expense removed." };
  }
  const limits = getPlanLimits(shop.plan);
  const count = await db.expense.count({ where: { shopId: shop.id } });
  if (intent === "create" && count >= limits.expenses) {
    return { message: `Starter includes ${limits.expenses} expenses. Upgrade for more.` };
  }
  const name = String(form.get("name") ?? "").trim();
  const category = String(form.get("category") ?? "other");
  const amount = String(form.get("amount") ?? "");
  const frequency = String(form.get("frequency") ?? "MONTHLY");
  const startDate = String(form.get("startDate") ?? "");
  const endDate = String(form.get("endDate") ?? "");
  if (!name || !amount || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return { message: "Name, amount, and start date are required." };
  }
  const data = {
    name,
    category,
    amount,
    frequency: FREQUENCIES.includes(frequency as (typeof FREQUENCIES)[number]) ? (frequency as (typeof FREQUENCIES)[number]) : "MONTHLY",
    startDate: toDbDate(startDate),
    endDate: /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? toDbDate(endDate) : null,
  };
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
    payload: { dates: eachDay(startDate, end < startDate ? startDate : end).slice(0, 400) },
  });
  return { message: "Expense saved. Daily share is amount divided by the period length." };
};

export default function ExpensesPage() {
  const data = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return (
    <s-page heading="Expenses">
      <s-stack direction="block" gap="base">
        {result?.message ? <s-banner tone="info" heading="Expenses">{result.message}</s-banner> : null}
        <s-paragraph>
          {data.count} of {Number.isFinite(data.limit) ? data.limit : "unlimited"} expenses. Daily share for today is shown in {data.currency}. Monthly expenses use the number of days in that month, so February is amount/28 or amount/29.
        </s-paragraph>
        <s-section heading="Add expense">
          <Form method="post">
            <input type="hidden" name="intent" value="create" />
            <s-text-field label="Name" name="name" />
            <s-select label="Category" name="category">
              <s-option value="apps">Apps</s-option>
              <s-option value="staff">Staff</s-option>
              <s-option value="software">Software</s-option>
              <s-option value="rent">Rent</s-option>
              <s-option value="other">Other</s-option>
            </s-select>
            <s-number-field label="Amount" name="amount" />
            <s-select label="Frequency" name="frequency" value="MONTHLY">
              {FREQUENCIES.map((frequency) => (
                <s-option key={frequency} value={frequency}>{frequency}</s-option>
              ))}
            </s-select>
            <s-date-field label="Start" name="startDate" value={data.today} />
            <s-date-field label="End (optional)" name="endDate" />
            <s-button type="submit" variant="primary">Save expense</s-button>
          </Form>
        </s-section>
        <s-table>
          <s-table-header-row>
            <s-table-header>Name</s-table-header>
            <s-table-header>Category</s-table-header>
            <s-table-header>Amount</s-table-header>
            <s-table-header>Frequency</s-table-header>
            <s-table-header>Today&apos;s share</s-table-header>
            <s-table-header></s-table-header>
          </s-table-header-row>
          <s-table-body>
            {data.expenses.map((expense) => (
              <s-table-row key={expense.id}>
                <s-table-cell>{expense.name}</s-table-cell>
                <s-table-cell>{expense.category}</s-table-cell>
                <s-table-cell>{expense.amount}</s-table-cell>
                <s-table-cell>{expense.frequency}</s-table-cell>
                <s-table-cell>{expense.daily}</s-table-cell>
                <s-table-cell>
                  <Form method="post">
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="id" value={expense.id} />
                    <s-button type="submit" tone="critical" variant="tertiary">Delete</s-button>
                  </Form>
                </s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
