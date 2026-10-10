import { CATEGORIES } from "../constants";
import type { Category, Expense, MonthKey } from "../types";
import { monthOf, shiftMonth } from "./format";

export const sumCents = (expenses: Expense[]) =>
  expenses.reduce((total, e) => total + e.amountCents, 0);

export const inMonth = (expenses: Expense[], month: MonthKey) =>
  expenses.filter((e) => monthOf(e.date) === month);

/** Totals per category, biggest first, skipping empty categories */
export function totalsByCategory(expenses: Expense[]) {
  const totals = new Map<Category, number>();
  for (const e of expenses) {
    totals.set(e.category, (totals.get(e.category) ?? 0) + e.amountCents);
  }
  return CATEGORIES.filter((c) => totals.has(c.name))
    .map((c) => ({ ...c, cents: totals.get(c.name)! }))
    .sort((a, b) => b.cents - a.cents);
}

/** Totals for the `count` months ending at `lastMonth`, oldest first */
export function monthlyTotals(
  expenses: Expense[],
  lastMonth: MonthKey,
  count: number
) {
  const months = Array.from({ length: count }, (_, i) =>
    shiftMonth(lastMonth, i - count + 1)
  );
  const totals = new Map<MonthKey, number>(months.map((m) => [m, 0]));
  for (const e of expenses) {
    const m = monthOf(e.date);
    if (totals.has(m)) totals.set(m, totals.get(m)! + e.amountCents);
  }
  return months.map((month) => ({ month, cents: totals.get(month)! }));
}
