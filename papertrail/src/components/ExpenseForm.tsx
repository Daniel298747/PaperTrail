import { useState } from "react";
import { CATEGORIES } from "../constants";
import { parseAmount, todayIso } from "../utils/format";
import type { Category, Expense } from "../types";

interface ExpenseFormProps {
  onAdd: (expense: Omit<Expense, "id">) => void;
}

export default function ExpenseForm({ onAdd }: ExpenseFormProps) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<Category>("Food");
  const [date, setDate] = useState(todayIso);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amountCents = parseAmount(amount);
    if (!description.trim()) return setError("Add a short description.");
    if (amountCents === null)
      return setError("Enter an amount above zero, e.g. 12.50.");
    if (!date) return setError("Pick a date.");

    onAdd({ description: description.trim(), amountCents, category, date });
    setDescription("");
    setAmount("");
    setError(null);
  };

  const inputClass =
    "w-full rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-sm " +
    "text-gray-200 outline-none focus:border-sky-500";
  const labelClass = "mb-0.5 block text-[10px] tracking-wide text-gray-400";

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-gray-800 bg-[#161b22] p-4"
    >
      <h2 className="mb-3 text-sm font-semibold text-gray-100">Add expense</h2>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        <label className="sm:col-span-2 lg:col-span-1">
          <span className={labelClass}>Description</span>
          <input
            className={inputClass}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Coffee with Sam"
            maxLength={80}
          />
        </label>

        <label>
          <span className={labelClass}>Amount</span>
          <input
            className={inputClass}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
          />
        </label>

        <label>
          <span className={labelClass}>Date</span>
          <input
            type="date"
            className={inputClass}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>

        <label className="sm:col-span-2 lg:col-span-1">
          <span className={labelClass}>Category</span>
          <select
            className={inputClass}
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
          >
            {CATEGORIES.map((c) => (
              <option key={c.name}>{c.name}</option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

      <button
        type="submit"
        className="mt-4 w-full rounded-md bg-sky-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-sky-500"
      >
        Add
      </button>
    </form>
  );
}
