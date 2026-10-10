import type { Expense } from "../types";

// Quote every field and double any quotes inside it (RFC 4180)
const cell = (value: string) => `"${value.replace(/"/g, '""')}"`;

export function toCsv(expenses: Expense[]): string {
  const header = ["Date", "Description", "Category", "Amount"].map(cell);
  const rows = expenses.map((e) =>
    [e.date, e.description, e.category, (e.amountCents / 100).toFixed(2)].map(
      cell
    )
  );
  return [header, ...rows].map((r) => r.join(",")).join("\r\n");
}

export function downloadCsv(expenses: Expense[], filename: string) {
  const blob = new Blob([toCsv(expenses)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
