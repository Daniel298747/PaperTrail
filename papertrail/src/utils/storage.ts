import { CATEGORIES, STORAGE_KEY } from "../constants";
import type { Expense } from "../types";

const VALID_CATEGORIES = new Set<string>(CATEGORIES.map((c) => c.name));

function isExpense(value: unknown): value is Expense {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.description === "string" &&
    Number.isInteger(e.amountCents) &&
    typeof e.category === "string" &&
    VALID_CATEGORIES.has(e.category) &&
    typeof e.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(e.date)
  );
}

// Storage can throw (private mode, blocked site data), so every access is guarded
export function loadExpenses(): Expense[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isExpense) : [];
  } catch {
    return [];
  }
}

export function saveExpenses(expenses: Expense[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
  } catch {
    // Nothing useful to do — the app keeps working in memory
  }
}
