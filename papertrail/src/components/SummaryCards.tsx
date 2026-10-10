import { formatCents } from "../utils/format";

interface SummaryCardsProps {
  totalCents: number;
  previousTotalCents: number;
  dailyAverageCents: number;
  count: number;
  topCategory: string | null;
}

export default function SummaryCards({
  totalCents,
  previousTotalCents,
  dailyAverageCents,
  count,
  topCategory,
}: SummaryCardsProps) {
  // Spending more than last month is the "bad" direction for an expense tracker
  let change: { text: string; className: string } | null = null;
  if (previousTotalCents > 0) {
    const pct = Math.round(
      ((totalCents - previousTotalCents) / previousTotalCents) * 100
    );
    change =
      pct === 0
        ? { text: "Same as last month so far", className: "text-gray-400" }
        : pct > 0
          ? { text: `▲ ${pct}% vs last month so far`, className: "text-red-400" }
          : { text: `▼ ${-pct}% vs last month so far`, className: "text-green-400" };
  }

  const cards = [
    { label: "Spent this month", value: formatCents(totalCents), sub: change },
    { label: "Daily average", value: formatCents(dailyAverageCents) },
    { label: "Expenses logged", value: String(count) },
    { label: "Top category", value: topCategory ?? "—" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-lg border border-gray-800 bg-[#161b22] p-4"
        >
          <p className="text-[11px] tracking-wide text-gray-400">
            {card.label}
          </p>
          <p className="mt-1 truncate text-xl font-semibold text-gray-100">
            {card.value}
          </p>
          {card.sub && (
            <p className={`mt-1 text-xs ${card.sub.className}`}>
              {card.sub.text}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
