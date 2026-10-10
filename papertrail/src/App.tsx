import { useEffect, useMemo, useState } from "react";
import Navbar from "./components/Navbar";
import ExpenseForm from "./components/ExpenseForm";
import SummaryCards from "./components/SummaryCards";
import CategoryBreakdown from "./components/CategoryBreakdown";
import MonthlyTrend from "./components/MonthlyTrend";
import ExpenseList from "./components/ExpenseList";
import { TREND_MONTHS } from "./constants";
import { loadExpenses, saveExpenses } from "./utils/storage";
import { downloadCsv } from "./utils/csv";
import { sampleExpenses } from "./utils/sample";
import {
  daysInMonth,
  monthOf,
  shiftMonth,
  todayIso,
} from "./utils/format";
import {
  inMonth,
  monthlyTotals,
  sumCents,
  totalsByCategory,
} from "./utils/stats";
import type { Category, Expense, MonthKey } from "./types";

// Newest first; ties broken by id so the order is stable
const byNewest = (a: Expense, b: Expense) =>
  b.date.localeCompare(a.date) || b.id.localeCompare(a.id);

export default function App() {
  const [expenses, setExpenses] = useState<Expense[]>(loadExpenses);
  const [month, setMonth] = useState<MonthKey>(() => monthOf(todayIso()));
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  const [search, setSearch] = useState("");
  const [lastDeleted, setLastDeleted] = useState<Expense | null>(null);

  const currentMonth = monthOf(todayIso());

  useEffect(() => saveExpenses(expenses), [expenses]);

  // Hide the undo prompt after a few seconds
  useEffect(() => {
    if (!lastDeleted) return;
    const timer = setTimeout(() => setLastDeleted(null), 5000);
    return () => clearTimeout(timer);
  }, [lastDeleted]);

  const monthExpenses = useMemo(
    () => inMonth(expenses, month).sort(byNewest),
    [expenses, month]
  );
  const categoryTotals = useMemo(
    () => totalsByCategory(monthExpenses),
    [monthExpenses]
  );
  const trend = useMemo(
    () =>
      monthlyTotals(
        expenses,
        // Keep the current month as the right-hand edge unless browsing older months
        month < shiftMonth(currentMonth, -(TREND_MONTHS - 1))
          ? shiftMonth(month, TREND_MONTHS - 1)
          : currentMonth,
        TREND_MONTHS
      ),
    [expenses, month, currentMonth]
  );

  const visibleExpenses = useMemo(() => {
    const query = search.trim().toLowerCase();
    return monthExpenses.filter(
      (e) =>
        (!activeCategory || e.category === activeCategory) &&
        (!query || e.description.toLowerCase().includes(query))
    );
  }, [monthExpenses, activeCategory, search]);

  const totalCents = sumCents(monthExpenses);
  // For the current month, average over the days so far, not the whole month
  const daysElapsed =
    month === currentMonth ? Number(todayIso().slice(8)) : daysInMonth(month);

  // Compare like with like: part of this month vs the same days of last month
  const previousTotalCents = sumCents(
    inMonth(expenses, shiftMonth(month, -1)).filter(
      (e) => Number(e.date.slice(8)) <= daysElapsed
    )
  );

  const changeMonth = (next: MonthKey) => {
    setMonth(next > currentMonth ? currentMonth : next);
    setActiveCategory(null);
  };

  const addExpense = (expense: Omit<Expense, "id">) => {
    setExpenses((prev) => [...prev, { ...expense, id: crypto.randomUUID() }]);
    changeMonth(monthOf(expense.date));
  };

  const deleteExpense = (id: string) => {
    setLastDeleted(expenses.find((e) => e.id === id) ?? null);
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  };

  const undoDelete = () => {
    if (lastDeleted) setExpenses((prev) => [...prev, lastDeleted]);
    setLastDeleted(null);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar
        month={month}
        isCurrentMonth={month === currentMonth}
        canExport={monthExpenses.length > 0}
        onPrevMonth={() => changeMonth(shiftMonth(month, -1))}
        onNextMonth={() => changeMonth(shiftMonth(month, 1))}
        onThisMonth={() => changeMonth(currentMonth)}
        onExport={() =>
          downloadCsv(monthExpenses, `papertrail-${month}.csv`)
        }
      />

      <main className="mx-auto grid w-full max-w-6xl gap-4 p-4 lg:grid-cols-[18rem_1fr] lg:p-6">
        <aside className="space-y-4">
          <ExpenseForm onAdd={addExpense} />
          {expenses.length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-700 p-4 text-sm text-gray-400">
              <p>New here? Load six months of example spending to explore.</p>
              <button
                className="mt-3 rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700"
                onClick={() =>
                  setExpenses(
                    sampleExpenses(currentMonth, Number(todayIso().slice(8)))
                  )
                }
              >
                Load sample data
              </button>
            </div>
          )}
        </aside>

        <div className="min-w-0 space-y-4">
          <SummaryCards
            totalCents={totalCents}
            previousTotalCents={previousTotalCents}
            dailyAverageCents={Math.round(totalCents / daysElapsed)}
            count={monthExpenses.length}
            topCategory={categoryTotals[0]?.name ?? null}
          />
          <div className="grid gap-4 md:grid-cols-2">
            <CategoryBreakdown
              totals={categoryTotals}
              activeCategory={activeCategory}
              onSelect={setActiveCategory}
            />
            <MonthlyTrend
              data={trend}
              selectedMonth={month}
              onSelect={changeMonth}
            />
          </div>
          <ExpenseList
            expenses={visibleExpenses}
            search={search}
            activeCategory={activeCategory}
            onSearchChange={setSearch}
            onDelete={deleteExpense}
          />
        </div>
      </main>

      {lastDeleted && (
        <div className="fixed bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-4 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-gray-200 shadow-lg">
          Deleted “{lastDeleted.description}”
          <button
            className="font-medium text-sky-400 hover:underline"
            onClick={undoDelete}
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
