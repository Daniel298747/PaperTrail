import { useState } from "react";
import { formatCents, formatMonth } from "../utils/format";
import type { MonthKey } from "../types";

interface MonthlyTrendProps {
  data: { month: MonthKey; cents: number }[];
  selectedMonth: MonthKey;
  onSelect: (month: MonthKey) => void;
}

const CHART_HEIGHT = 120;

export default function MonthlyTrend({
  data,
  selectedMonth,
  onSelect,
}: MonthlyTrendProps) {
  const [hovered, setHovered] = useState<MonthKey | null>(null);
  const max = Math.max(...data.map((d) => d.cents), 1);
  const focus = hovered ?? selectedMonth;
  const focused = data.find((d) => d.month === focus);

  return (
    <section className="rounded-lg border border-gray-800 bg-[#161b22] p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-100">
          Last {data.length} months
        </h2>
        {focused && (
          <p className="text-xs text-gray-400">
            {formatMonth(focused.month)}:{" "}
            <span className="tabular-nums text-gray-200">
              {formatCents(focused.cents)}
            </span>
          </p>
        )}
      </div>

      <div
        className="flex items-end gap-2 border-b border-gray-700"
        style={{ height: CHART_HEIGHT }}
        onMouseLeave={() => setHovered(null)}
      >
        {data.map((d) => {
          const isSelected = d.month === selectedMonth;
          return (
            // The whole column is the hit target, not just the bar
            <button
              key={d.month}
              className="flex h-full flex-1 items-end justify-center rounded-t-md hover:bg-gray-800/60"
              onMouseEnter={() => setHovered(d.month)}
              onFocus={() => setHovered(d.month)}
              onBlur={() => setHovered(null)}
              onClick={() => onSelect(d.month)}
              aria-label={`${formatMonth(d.month)}: ${formatCents(d.cents)}`}
            >
              <div
                className="w-full max-w-[2.5rem] rounded-t transition-[height]"
                style={{
                  height: d.cents ? `${Math.max((d.cents / max) * 100, 2)}%` : 0,
                  backgroundColor: isSelected ? "#3987e5" : "#1c5cab",
                }}
              />
            </button>
          );
        })}
      </div>

      <div className="mt-1 flex gap-2">
        {data.map((d) => (
          <span
            key={d.month}
            className={`flex-1 text-center text-[11px] ${
              d.month === selectedMonth ? "text-gray-200" : "text-gray-500"
            }`}
          >
            {formatMonth(d.month, "short")}
          </span>
        ))}
      </div>
    </section>
  );
}
