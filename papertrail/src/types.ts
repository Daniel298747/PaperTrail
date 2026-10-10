export type Category =
  | "Food"
  | "Transport"
  | "Housing"
  | "Bills"
  | "Shopping"
  | "Entertainment"
  | "Health"
  | "Other";

export interface Expense {
  id: string;
  description: string;
  /** Stored in cents to avoid floating-point rounding errors */
  amountCents: number;
  category: Category;
  /** ISO date string, YYYY-MM-DD */
  date: string;
}

/** Month key in the form YYYY-MM */
export type MonthKey = string;
