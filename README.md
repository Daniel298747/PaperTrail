# PaperTrail

PaperTrail is a simple, private expense tracker built using modern web technologies. It lets you log your spending in seconds, see where your money goes each month, and spot trends over time — all without an account, a server or a bank login.

## 🌐 Live Demo

**[Try it now → daniel298747.github.io/PaperTrail](https://daniel298747.github.io/PaperTrail/)**

Runs entirely in the browser — nothing to install. Hit **Load sample data** to explore with six months of example spending.

## Technologies Used

- React
- TypeScript
- Vite
- Tailwind CSS

## Inspiration

As a student I never really knew where my money went each month — a coffee here, a Leap card top-up there, and suddenly the account is lower than expected. Most budgeting apps want you to sign up, link a bank account or pay for a subscription, which felt like overkill for just keeping a paper trail of what I spend.

So I built the tool I actually wanted: open it, type in what you bought, and get an instant breakdown. It was also a chance to keep practising the React + TypeScript + Vite + Tailwind stack from my last project, this time focusing on state management, derived data and working with browser storage rather than animation.

## Features

- **Quick expense logging:** Description, amount, date and one of eight categories
- **Monthly summary:** Total spent, daily average, number of expenses and your top category
- **Month-on-month comparison:** See whether you're spending more or less than at the same point last month
- **Category breakdown:** Bars showing how much of the month each category takes up — click one to filter the list
- **Six-month trend:** A bar chart of monthly totals; click any month to jump to it
- **Search and filter:** Find any expense by description or category
- **Undo delete:** Removed something by mistake? Undo it straight away
- **Export to CSV:** Download any month's expenses to open in Excel or Google Sheets
- **Private by design:** Everything is saved in your browser's local storage and never leaves your device

## How It Works

### 🔹 Storing money as cents

Amounts are stored as whole numbers of cents (`1250` rather than `12.50`). Floating-point numbers can't represent most decimals exactly — in JavaScript `0.1 + 0.2` is `0.30000000000000004` — so adding up hundreds of euro amounts as floats slowly drifts. Integers add up exactly, and are only turned back into euro when displayed, using `Intl.NumberFormat`.

### 🔹 Derived state

The only real state is the list of expenses. Everything else — monthly totals, category breakdowns, the trend chart — is calculated from that list with `useMemo`, so the numbers can never fall out of sync with the data.

### 🔹 Saving in the browser

Expenses are saved to `localStorage` every time they change and loaded on startup. Saved data is validated when it's read back, so a corrupted or outdated entry is skipped instead of crashing the app, and if storage is blocked (e.g. in a private window) the app keeps working in memory.

### 🔹 Fair month comparisons

Comparing the first ten days of this month against the whole of last month would always look like you're spending less. Instead, PaperTrail compares this month so far against the same days of last month, and the daily average only counts days that have actually happened.

### 🔹 Colour-blind friendly categories

Each category keeps a fixed colour, chosen from a palette that was checked to stay distinguishable for the common types of colour blindness. Colour is never the only clue either — every bar and expense is labelled with its category name.

## Project Structure

```
papertrail/src
├── App.tsx              # app state and layout
├── components/          # Navbar, ExpenseForm, SummaryCards, CategoryBreakdown, MonthlyTrend, ExpenseList
├── utils/
│   ├── format.ts        # currency, date and month helpers
│   ├── stats.ts         # totals by month and category
│   ├── storage.ts       # load/save to localStorage with validation
│   ├── csv.ts           # CSV export
│   └── sample.ts        # example data for the demo
├── constants.ts         # categories, colours, currency
└── types.ts
```

## Run Locally

You only need this if you want to work on the code — the [live demo](https://daniel298747.github.io/PaperTrail/) needs no setup. Requires [Node.js](https://nodejs.org/) 18+.

```bash
# clone the repo and move into the app folder
git clone https://github.com/Daniel298747/PaperTrail.git
cd PaperTrail/papertrail

# install dependencies
npm install

# start the dev server (opens at http://localhost:5173)
npm run dev

# build for production
npm run build

# preview the production build (served at http://localhost:4173/PaperTrail/)
npm run preview
```

## Deployment

Every push to `main` is built and published to GitHub Pages by [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). It can also be run manually from the **Actions** tab.
