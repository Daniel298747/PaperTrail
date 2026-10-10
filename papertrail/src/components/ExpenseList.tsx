import { CATEGORY_COLOR } from "../constants";
import { formatCents, formatDate } from "../utils/format";
import type { Category, Expense } from "../types";

interface ExpenseListProps {
  expenses: Expense[];
  search: string;
  activeCategory: Category | null;
  onSearchChange: (search: string) => void;
  onDelete: (id: string) => void;
}

export default function ExpenseList({
  expenses,
  search,
  activeCategory,
  onSearchChange,
  onDelete,
}: ExpenseListProps) {
  return (
    <section className="rounded-lg border border-gray-800 bg-[#161b22] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-100">
          Expenses
          {activeCategory && (
            <span className="ml-2 font-normal text-gray-400">
              · {activeCategory}
            </span>
          )}
        </h2>
        <input
          className="w-full rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-sm text-gray-200 outline-none focus:border-sky-500 sm:w-56"
          placeholder="Search…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      {expenses.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">
          No expenses to show.
        </p>
      ) : (
        <ul className="divide-y divide-gray-800">
          {expenses.map((e) => (
            <li key={e.id} className="group flex items-center gap-3 py-2.5">
              <span className="w-14 shrink-0 text-xs tabular-nums text-gray-500">
                {formatDate(e.date)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-gray-200">
                  {e.description}
                </p>
                <p className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span
                    className="inline-block h-2 w-2 rounded-sm"
                    style={{ backgroundColor: CATEGORY_COLOR[e.category] }}
                  />
                  {e.category}
                </p>
              </div>
              <span className="text-sm tabular-nums text-gray-100">
                {formatCents(e.amountCents)}
              </span>
              <button
                className="rounded px-1.5 text-gray-500 transition-colors hover:bg-gray-800 hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                onClick={() => onDelete(e.id)}
                aria-label={`Delete ${e.description}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
