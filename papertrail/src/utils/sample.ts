import type { Category, Expense } from "../types";
import { shiftMonth } from "./format";

// [day of month, description, category, euros] — repeated over recent months
const TEMPLATE: [number, string, Category, number][] = [
  [1, "Rent", "Housing", 850],
  [2, "Groceries", "Food", 62.4],
  [3, "Leap card top-up", "Transport", 30],
  [5, "Phone bill", "Bills", 20],
  [7, "Cinema", "Entertainment", 14.5],
  [9, "Groceries", "Food", 48.15],
  [12, "Pharmacy", "Health", 18.9],
  [14, "New trainers", "Shopping", 79.99],
  [16, "Lunch with friends", "Food", 23.5],
  [18, "Electricity", "Bills", 64.3],
  [21, "Groceries", "Food", 55.8],
  [24, "Concert tickets", "Entertainment", 45],
  [27, "Haircut", "Other", 25],
];

export function sampleExpenses(currentMonth: string, today: number): Expense[] {
  const expenses: Expense[] = [];
  for (let back = 0; back < 6; back++) {
    const month = shiftMonth(currentMonth, -back);
    TEMPLATE.forEach(([day, description, category, euros], i) => {
      if (back === 0 && day > today) return; // nothing in the future
      // Vary amounts a little month to month so the trend isn't flat
      const wobble = 1 + (((back * 7 + i * 3) % 9) - 4) / 20;
      const amountCents =
        category === "Housing"
          ? Math.round(euros * 100)
          : Math.round(euros * wobble * 100);
      expenses.push({
        id: `sample-${month}-${i}`,
        description,
        amountCents,
        category,
        date: `${month}-${String(day).padStart(2, "0")}`,
      });
    });
  }
  return expenses;
}
