import type { Category } from "./types";

export const STORAGE_KEY = "papertrail.expenses.v1";

export const CURRENCY = "EUR";
export const LOCALE = "en-IE";

// Fixed order — a category always keeps the same colour, whatever the filter.
// These eight hues are checked for colour-blind separation on the dark surface.
export const CATEGORIES: { name: Category; color: string }[] = [
  { name: "Food", color: "#3987e5" },
  { name: "Transport", color: "#d95926" },
  { name: "Housing", color: "#199e70" },
  { name: "Bills", color: "#c98500" },
  { name: "Shopping", color: "#d55181" },
  { name: "Entertainment", color: "#008300" },
  { name: "Health", color: "#9085e9" },
  { name: "Other", color: "#e66767" },
];

export const CATEGORY_COLOR: Record<Category, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.name, c.color])
) as Record<Category, string>;

/** Number of months shown in the monthly trend chart */
export const TREND_MONTHS = 6;
