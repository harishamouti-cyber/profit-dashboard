import { D, type Decimal } from "../money";
import { daysInMonth, daysInYear } from "../tz";

export type ExpenseFrequency = "ONE_TIME" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export interface ExpenseShareInput {
  amount: Decimal;
  frequency: ExpenseFrequency;
  startDate: string;
  endDate?: string | null;
}

/** Shop-currency amount recognized on one local day. Inactive days are 0. */
export function dailyShare(expense: ExpenseShareInput, date: string): Decimal {
  if (date < expense.startDate) return D(0);
  if (expense.endDate && date > expense.endDate) return D(0);

  switch (expense.frequency) {
    case "DAILY":
      return D(expense.amount);
    case "WEEKLY":
      return D(expense.amount).div(7);
    case "MONTHLY":
      return D(expense.amount).div(daysInMonth(date));
    case "YEARLY":
      return D(expense.amount).div(daysInYear(date));
    case "ONE_TIME":
      return date === expense.startDate ? D(expense.amount) : D(0);
    default:
      return D(0);
  }
}
