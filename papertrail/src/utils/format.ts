import { CURRENCY, LOCALE } from "../constants";
import type { MonthKey } from "../types";

const currency = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: CURRENCY,
});

export const formatCents = (cents: number) => currency.format(cents / 100);

/** Parse a user-typed amount like "12.5" or "12,50" into whole cents */
export function parseAmount(input: string): number | null {
  const normalised = input.trim().replace(",", ".");
  if (!/^\d+(\.\d{0,2})?$/.test(normalised)) return null;
  const cents = Math.round(parseFloat(normalised) * 100);
  return cents > 0 ? cents : null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Today's date as YYYY-MM-DD in the user's local time zone */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const monthOf = (isoDate: string): MonthKey => isoDate.slice(0, 7);

export function shiftMonth(month: MonthKey, delta: number): MonthKey {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function daysInMonth(month: MonthKey): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export function formatMonth(month: MonthKey, style: "long" | "short" = "long") {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(LOCALE, {
    month: style,
    year: style === "long" ? "numeric" : undefined,
  });
}

export function formatDate(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(LOCALE, {
    day: "numeric",
    month: "short",
  });
}
