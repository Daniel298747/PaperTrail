import { formatCents } from "../utils/format";
import type { Category } from "../types";

interface CategoryBreakdownProps {
  totals: { name: Category; color: string; cents: number }[];
  activeCategory: Category | null;
  onSelect: (category: Category | null) => void;
}

export default function CategoryBreakdown({
  totals,
  activeCategory,
  onSelect,
}: CategoryBreakdownProps) {
  const grandTotal = totals.reduce((sum, t) => sum + t.cents, 0);
  const max = totals[0]?.cents ?? 0;

  return (
    <section className="rounded-lg border border-gray-800 bg-[#161b22] p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-gray-100">By category</h2>
        {activeCategory && (
          <button
            className="text-xs text-sky-400 hover:underline"
            onClick={() => onSelect(null)}
          >
            Clear filter
          </button>
        )}
      </div>

      {totals.length === 0 ? (
        <p className="text-sm text-gray-500">Nothing spent this month yet.</p>
      ) : (
        <ul className="space-y-1">
          {totals.map((t) => {
            const share = Math.round((t.cents / grandTotal) * 100);
            const dimmed = activeCategory !== null && activeCategory !== t.name;
            return (
              <li key={t.name}>
                <button
                  className={`w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-gray-800 ${
                    dimmed ? "opacity-40" : ""
                  }`}
                  onClick={() =>
                    onSelect(activeCategory === t.name ? null : t.name)
                  }
                  aria-pressed={activeCategory === t.name}
                  title={`${t.name}: ${formatCents(t.cents)} (${share}%) — click to filter`}
                >
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 text-gray-200">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-sm"
                        style={{ backgroundColor: t.color }}
                      />
                      {t.name}
                    </span>
                    <span className="tabular-nums text-gray-300">
                      {formatCents(t.cents)}
                      <span className="ml-2 text-xs text-gray-500">
                        {share}%
                      </span>
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-800">
                    <div
                      className="h-2 rounded-full"
                      style={{
                        width: `${Math.max((t.cents / max) * 100, 2)}%`,
                        backgroundColor: t.color,
                      }}
                    />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
