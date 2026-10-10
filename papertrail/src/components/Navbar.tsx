import { formatMonth } from "../utils/format";
import type { MonthKey } from "../types";

interface NavbarProps {
  month: MonthKey;
  isCurrentMonth: boolean;
  canExport: boolean;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onThisMonth: () => void;
  onExport: () => void;
}

export default function Navbar({
  month,
  isCurrentMonth,
  canExport,
  onPrevMonth,
  onNextMonth,
  onThisMonth,
  onExport,
}: NavbarProps) {
  const buttonClass =
    "rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-sm " +
    "text-gray-200 transition-colors hover:bg-gray-700 " +
    "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-gray-800";

  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-4 border-b border-gray-800 bg-[#161b22] px-6 py-3">
      <h1 className="text-xl font-semibold tracking-wide text-gray-100">
        PaperTrail
      </h1>

      <div className="flex flex-wrap items-center gap-2">
        <button
          className={buttonClass}
          onClick={onPrevMonth}
          aria-label="Previous month"
        >
          ←
        </button>
        <span className="min-w-[9rem] text-center text-sm font-medium text-gray-100">
          {formatMonth(month)}
        </span>
        <button
          className={buttonClass}
          onClick={onNextMonth}
          disabled={isCurrentMonth}
          aria-label="Next month"
        >
          →
        </button>
        <button
          className={buttonClass}
          onClick={onThisMonth}
          disabled={isCurrentMonth}
        >
          This month
        </button>
        <button
          className={buttonClass}
          onClick={onExport}
          disabled={!canExport}
        >
          Export CSV
        </button>
      </div>
    </div>
  );
}
