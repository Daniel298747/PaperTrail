# PaperTrail

**Household bill & document manager.** Upload the statements that arrive each month, track amounts and due
dates, set recurring bills up once, keep every version of every statement, and see where the money goes by
provider and category.

- **Bills**: create, edit, delete, search, filter, sort and page through bills; overdue status is derived from
  the due date in the household's timezone; one-click *Mark paid* (with undo) updates every total immediately.
- **Recurring bills**: monthly, quarterly and annual schedules. A scheduled job creates each instance 30 days
  ahead and issues reminders before the due date. It is idempotent and safe to run concurrently.
- **Statements on S3**: PDF, JPG and PNG uploads go to a private bucket. Every replacement upload becomes a
  new version, earlier versions stay retrievable, and access is through short-lived signed URLs issued only
  after an ownership check.
- **REST API + analytics**: JWT-authenticated API, with SQL-computed outstanding balances, monthly billed and
  paid totals, spending by category and per-provider cost trends.

Stack: **Java 21 · Spring Boot 4.1 · Spring Security 7 · Spring Data JPA (Hibernate 7) · Flyway ·
PostgreSQL 17 · AWS SDK v2 (S3) · React 19 · TypeScript · Vite 8 · TanStack Query 5 · React Router 8 ·
React Hook Form + Zod**.

## 🌐 Live Demo

**[Try it now → daniel298747.github.io/PaperTrail](https://daniel298747.github.io/PaperTrail/)**

Click **Explore the demo household** to open a year of bills, recurring schedules, statements and reminders.
GitHub Pages only serves static files, so the demo build runs the REST API **in your browser**
(`frontend/src/demo`, a TypeScript port of the Spring services) and keeps its data on your device. The full
stack below is what runs it for real. See [Static demo build](#static-demo-build-github-pages).

---

## Contents

1. [Architecture](#architecture)
2. [Directory structure](#directory-structure)
3. [Running it](#running-it): Docker Compose, without Docker, or the static demo build
4. [Demo data](#demo-data)
5. [Configuration](#configuration): environment variables, MinIO and AWS S3
6. [API](#api)
7. [Authentication and ownership](#authentication-and-ownership)
8. [Recurring bills and reminders](#recurring-bills-and-reminders)
9. [Analytics definitions](#analytics-definitions)
10. [Tests and verification](#tests-and-verification)
11. [Design notes](#design-notes)
12. [Known limitations](#known-limitations)

---

## Architecture

```
 Browser (React SPA)
   │  access token in memory · refresh token in HttpOnly cookie (path /api/auth)
   │
   │  same origin: /api/*                       signed URLs (5 min) for preview/download
   ▼                                               ▲            │
 nginx (Docker) / Vite (dev)                        │            ▼
   │  static SPA + reverse proxy                    │     ┌──────────────────────────┐
   ▼                                                │     │ S3 / MinIO-compatible    │
 ┌───────────────────────── Spring Boot API ─────┐  │     │ private bucket           │
 │ Security: JWT resource server, CSRF on cookie │  │     │ statements/{user}/{bill} │
 │   endpoints, CORS from env, problem+json      │  │     └──────────────────────────┘
 │ Controllers → Services → Repositories → JPA   │──┘ put / delete / presign  ▲
 │ Analytics (SQL aggregates, numeric math)      │─────────────────────────────┘
 │ RecurringBillJob (cron, every 15 min, UTC):   │
 │   generate instances → create reminders       │
 └──────────────┬────────────────────────────────┘
                │ JDBC (Flyway-migrated schema)
                ▼
          PostgreSQL 17
   users · refresh_tokens · providers · categories · bills
   recurring_bill_schedules · schedule_occurrences (generation ledger)
   bill_document_versions · notifications
```

- **Layers**: each feature package (`bill`, `schedule`, `document`, …) has a controller (HTTP + DTOs),
  a service (transactions, ownership and rules) and repositories. JPA entities are never serialised. Every
  response is a DTO record, and errors are RFC 9457 `application/problem+json` with a stable `code` and
  per-field `errors`.
- **Database invariants**: money is `numeric(12,2)`. Composite foreign keys such as
  `(provider_id, user_id) → providers(id, user_id)` make cross-household references impossible even if
  application code were wrong. A `PAID` bill must have a payment date and an unpaid one must not, via a check
  constraint. Document versions are unique per bill and storage keys are unique. Generation and reminder
  idempotency are unique constraints.

## Directory structure

```
papertrail/
├── docker-compose.yml          PostgreSQL, MinIO-compatible storage, API, web
├── .github/workflows/          GitHub Pages deployment of the static demo
├── .env.example                every setting, documented (copy to .env)
├── backend/                    Spring Boot API (Maven wrapper included)
│   ├── Dockerfile
│   ├── src/main/java/com/papertrail/
│   │   ├── account/            users, settings, household timezone ("today")
│   │   ├── auth/               register/login/refresh/logout, JWT + rotating refresh tokens
│   │   ├── security/           filter chain, CSRF, CORS, JWT keys, @CurrentUser
│   │   ├── bill/               bills, filters/sorting/paging, payments
│   │   ├── provider/ category/ reference data with safe delete/reassign
│   │   ├── document/           uploads, version history, signed links, archive
│   │   ├── storage/            ObjectStorage abstraction, S3 implementation
│   │   ├── schedule/           recurrence rules, schedules, idempotent generation
│   │   ├── notification/       reminders + notification centre
│   │   ├── analytics/          SQL-backed metrics
│   │   ├── jobs/               scheduled job (generation + reminders + session cleanup)
│   │   ├── seed/               development-only demo household + fictional statements
│   │   └── common/             errors, paging, money helpers
│   ├── src/main/resources/db/migration/V1__initial_schema.sql
│   └── src/test/java/…         61 tests (embedded PostgreSQL) + LocalDevApplication
├── frontend/                   React + TypeScript SPA
│   ├── Dockerfile, nginx/      production image (nginx + same-origin /api proxy + CSP)
│   └── src/
│       ├── api/                fetch client (token refresh, CSRF), DTO types, query hooks
│       ├── demo/               in-browser API for the static GitHub Pages demo (demo builds only)
│       ├── auth/               session context and route guards
│       ├── components/         app shell, dialogs, status labels, upload, charts/
│       ├── pages/              the eleven screens
│       ├── lib/                formatting, forms, statements, debounce helpers
│       └── styles/             tokens, base, layout, components, pages, charts
└── e2e/                        Playwright: end-to-end flow, PDF preview, screenshot pass
```

## Running it

### Option A: Docker Compose (everything in containers)

```bash
cp .env.example .env            # Windows PowerShell: Copy-Item .env.example .env
# edit .env: set POSTGRES_PASSWORD, MINIO_ROOT_PASSWORD (=S3_SECRET_KEY), optionally APP_JWT_SECRET
docker compose up --build
```

| Service | URL |
|---|---|
| Web app | http://localhost:3000 |
| API | http://localhost:8080 (health: `/actuator/health`) |
| Storage S3 API / console | http://localhost:9000 / http://localhost:9001 |
| PostgreSQL | localhost:5432 |

`minio-init` creates the private bucket before the API starts.

> **About the MinIO image.** In 2025 MinIO stopped publishing community binaries and Docker images
> (`minio/minio` is gone from Docker Hub and `dl.min.io` returns *410 Gone*). Compose therefore uses
> `pgsty/silo`, the maintained community fork of the MinIO server. It has the same S3 API, the same
> `MINIO_ROOT_*` settings, and bundles the MinIO client as `mcli`. It is pinned to
> `RELEASE.2026-09-16T00-00-00Z`. Any S3-compatible server works; the API only speaks S3.

### Option B: without Docker (how this project was verified)

Needs **Java 21** and **Node 22.22+** (24 LTS recommended). PostgreSQL does not need to be installed.

**1. Object storage.** Run any S3-compatible server on `localhost:9000`. With the Silo build of the MinIO
server (download the `windows_amd64`, `darwin_*` or `linux_*` archive from
<https://github.com/pgsty/silo/releases> and check it against the published checksums):

```bash
MINIO_ROOT_USER=papertrail MINIO_ROOT_PASSWORD=change-me-storage-password \
  ./silo server ./storage-data --address 127.0.0.1:9000 --console-address 127.0.0.1:9001
```
```powershell
$env:MINIO_ROOT_USER='papertrail'; $env:MINIO_ROOT_PASSWORD='change-me-storage-password'
.\silo.exe server .\storage-data --address 127.0.0.1:9000 --console-address 127.0.0.1:9001
```
(Use the same credentials as `S3_ACCESS_KEY` / `S3_SECRET_KEY` in `.env`. The API creates the bucket.)

**2. API with an embedded PostgreSQL 17** (data persists in `backend/.local/pgdata`, port 5433):

```bash
cp .env.example .env                          # once; the API reads ../.env
cd backend
./mvnw spring-boot:test-run                   # Windows: .\mvnw.cmd spring-boot:test-run
```

To use your own PostgreSQL instead, set `DATABASE_URL` / `DATABASE_USERNAME` / `DATABASE_PASSWORD` and run
`./mvnw spring-boot:run`.

**3. Web app**:

```bash
cd frontend
npm install
npm run dev                                   # http://localhost:5173 (proxies /api to :8080)
# or the production build with the production CSP:
npm run build && npx vite preview             # http://localhost:4173
```

### Static demo build (GitHub Pages)

The live demo is the same SPA built with `--mode demo` (`frontend/.env.demo`). In that mode the HTTP client
hands each `/api/...` request to `frontend/src/demo/server.ts` instead of `fetch`. It is an in-browser
implementation of the REST API that follows the Spring services rule for rule: validation messages and
error codes, derived overdue status, the recurrence rule and idempotent generation ledger, due-soon and
overdue reminders, statement versioning with magic-byte type checks, and the analytics definitions below.
On a visitor's first load it builds the same demo household as the backend seeder, including fictional PDF
statements and receipt images.

- Data lives in the visitor's browser: the database in `localStorage`, uploaded files in IndexedDB.
  **Reset demo** (banner at the top of every page) rebuilds the original household.
- Statements open from `blob:` URLs in place of signed S3 links.
- Normal builds never include `src/demo` (the import is behind a build-time constant).

```bash
cd frontend
npm run build:demo                            # dist/ served under /PaperTrail/
npm run preview:demo                          # http://localhost:4173/PaperTrail/
```

`.github/workflows/deploy.yml` runs this on every push to `main` and publishes `dist/` to GitHub Pages
(with `index.html` copied to `404.html` so deep links load the app). Enable it once under
*Settings → Pages → Source: GitHub Actions*.

## Demo data

A development-only demo household: **`demo@papertrail.local` / `paper-trail-demo`**.

It contains 10 fictional providers and 9 recurring schedules (rent, energy, gas, broadband, mobile, water,
streaming, home and car insurance), about 13 months of paid history, two overdue bills, bills due this week,
upcoming instances created by the real generation job, 17 fictional PDF/PNG/JPEG statements (two bills with a
corrected second version), and reminders. **All dates are relative to today** (Europe/Dublin), so the demo
always shows paid, overdue and upcoming bills. Re-seeding replaces the demo household and its stored files.

| Where | Seed command |
|---|---|
| Docker Compose | `docker compose run --rm -e APP_SEED_DEMO=true -e APP_SEED_EXIT=true backend` |
| Local (bash) | `cd backend && APP_SEED_DEMO=true ./mvnw spring-boot:test-run` |
| Local (PowerShell) | `cd backend; $env:APP_SEED_DEMO='true'; .\mvnw.cmd spring-boot:test-run` |

`APP_SEED_EXIT=true` makes the process exit after seeding. The seeder refuses to run when the `prod`
Spring profile is active.

## Configuration

All settings are environment variables (see `.env.example`). Locally, the API also imports `../.env`;
real environment variables always win.

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` / `DATABASE_USERNAME` / `DATABASE_PASSWORD` | `jdbc:postgresql://localhost:5432/papertrail` | PostgreSQL connection |
| `APP_JWT_SECRET` | *(empty)* | HS256 key, base64, ≥ 32 bytes (`openssl rand -base64 48`). Empty: random per-process key (dev only). **Required with the `prod` profile** (startup fails otherwise). |
| `APP_JWT_ACCESS_TTL` | `PT15M` | Access-token lifetime |
| `APP_REFRESH_TTL` | `P30D` | Refresh-session lifetime (sliding, rotated on every use) |
| `APP_COOKIE_SECURE` | `true` | `Secure` flag on refresh and CSRF cookies (set `false` for plain-http local runs) |
| `APP_COOKIE_SAME_SITE` | `Strict` | SameSite for those cookies (`None` needs `Secure` and a cross-site deployment) |
| `APP_CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | Comma-separated origins allowed to call the API with credentials |
| `APP_BCRYPT_STRENGTH` | `12` | Password hashing work factor |
| `S3_BUCKET` | `papertrail-documents` | Bucket name |
| `S3_REGION` | `eu-west-1` | Region (`us-east-1` for MinIO) |
| `S3_ENDPOINT` | *(empty)* | How the API reaches S3. Empty means AWS. MinIO: `http://localhost:9000` / `http://minio:9000` |
| `S3_PUBLIC_ENDPOINT` | *(= endpoint)* | Host put into signed URLs; must be reachable from browsers |
| `S3_PATH_STYLE_ACCESS` | `false` | `true` for MinIO |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | *(empty)* | Static keys (MinIO). Empty means the AWS default credential chain (IAM role, profile, env) |
| `S3_CREATE_BUCKET` | `false` | Create the bucket at startup if missing (local use) |
| `S3_PRESIGN_TTL` | `PT5M` | Signed URL lifetime |
| `APP_UPLOAD_MAX_SIZE` | `10MB` | Statement size limit (validated server-side) |
| `APP_JOBS_ENABLED` / `APP_JOBS_CRON` | `true` / `0 */15 * * * *` | Scheduled job and its cron (UTC) |
| `APP_RECURRING_HORIZON_DAYS` | `30` | How far ahead recurring bills are created |
| `APP_SEED_DEMO` / `APP_SEED_EXIT` | `false` | Demo seeding (development only) |
| `VITE_API_BASE_URL` (frontend build) | *(empty)* | API origin for split deployments; empty means same origin |
| `VITE_PROXY_TARGET` (frontend dev) | `http://localhost:8080` | Where Vite proxies `/api` |
| `BACKEND_URL`, `STORAGE_PUBLIC_ORIGIN` (web image) | `http://backend:8080`, `http://localhost:9000` | nginx upstream; storage origin allowed in the CSP (`img-src`, `frame-src`) for previews |

### Local MinIO

`docker compose up` handles it. Outside Docker, point `S3_ENDPOINT` and `S3_PUBLIC_ENDPOINT` at the server,
set `S3_PATH_STYLE_ACCESS=true`, `S3_REGION=us-east-1` and the root credentials as access/secret keys. The
bucket stays private (no anonymous policy); unsigned requests get `403`.

### Real AWS S3

1. Create a bucket with **Block Public Access** fully on and default encryption (SSE-S3 or SSE-KMS).
   Bucket CORS is not needed: previews load in an `<iframe>`/`<img>` and downloads are top-level navigations.
2. Grant the API's role `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on `arn:aws:s3:::BUCKET/*` and
   `s3:ListBucket` on `arn:aws:s3:::BUCKET` (used by the bucket check).
3. Configure the API:
   ```
   S3_BUCKET=your-bucket   S3_REGION=eu-west-1
   S3_ENDPOINT=            S3_PUBLIC_ENDPOINT=
   S3_PATH_STYLE_ACCESS=false   S3_CREATE_BUCKET=false
   S3_ACCESS_KEY=          S3_SECRET_KEY=        # empty → IAM role / default credential chain
   ```
4. In the web image set `STORAGE_PUBLIC_ORIGIN=https://your-bucket.s3.eu-west-1.amazonaws.com` so the CSP
   allows statement previews.

## API

All endpoints except `/api/auth/*` and `/actuator/health` require `Authorization: Bearer <access token>`.
Errors are `application/problem+json`: `{ "status", "title", "detail", "code", "errors": [{field, message}] }`.

| Method & path | Purpose |
|---|---|
| `GET /api/auth/csrf` | CSRF header name + token for the cookie-authenticated auth endpoints |
| `POST /api/auth/register` · `POST /api/auth/login` | Create account / sign in → `{accessToken, expiresAt, account}` + refresh cookie |
| `POST /api/auth/refresh` | Rotate the refresh cookie, new access token (`204` if there is no cookie at all) |
| `POST /api/auth/logout` | End this session (revokes its refresh-token family, clears the cookie) |
| `GET /api/account` · `PATCH /api/account` | Household settings: name, timezone, currency (locked once bills exist), default reminder |
| `POST /api/account/password` | Change password; signs out every other session |
| `GET /api/bills` | `q, status (outstanding\|unpaid\|overdue\|paid), providerId, categoryId, scheduleId, dueFrom, dueTo, sort (dueDate\|amount\|title\|provider\|category\|status\|paidDate\|createdAt, asc\|desc), page, size` |
| `POST /api/bills` · `GET/PUT/DELETE /api/bills/{id}` | Bill CRUD; `PUT` accepts `version` for optimistic locking (`409 stale_update`) |
| `POST /api/bills/{id}/payment` · `DELETE …/payment` | Mark paid (`{paidDate}` optional, defaults to today in the household timezone) / unpaid |
| `GET/POST /api/bills/{id}/documents` | Version history / upload a new version (`multipart/form-data`, field `file`) |
| `GET /api/documents` | Archive: `q, providerId, latestOnly, sort, page, size` |
| `GET /api/documents/{id}/link?download=` | Ownership-checked signed URL (inline preview or attachment download) |
| `GET/POST /api/providers` · `PUT/DELETE /api/providers/{id}?reassignTo=` | Providers with usage counts; delete-in-use needs `reassignTo` (`409 provider_in_use` otherwise) |
| `GET/POST /api/categories` · `PUT/DELETE /api/categories/{id}?reassignTo=` | Same contract for categories |
| `GET/POST /api/schedules` · `GET/PUT/DELETE /api/schedules/{id}` | Recurring schedules (detail includes upcoming dates and generated bills) |
| `POST /api/schedules/{id}/pause` · `…/resume` · `POST /api/schedules/preview` | Pause/resume; preview the due dates a rule produces |
| `GET /api/notifications?unreadOnly=` · `GET …/unread-count` · `POST …/{id}/read` · `POST …/read-all` | Notification centre |
| `GET /api/analytics/summary\|monthly\|categories\|providers?from=YYYY-MM&to=YYYY-MM&providerId=` | Analytics (see definitions below) |

Example session with curl (the CSRF cookie and token are needed only for `/api/auth/*`):

```bash
TOKEN=$(curl -s -c jar -b jar localhost:8080/api/auth/csrf | jq -r .token)
ACCESS=$(curl -s -c jar -b jar -H 'Content-Type: application/json' -H "X-XSRF-TOKEN: $TOKEN" \
  -d '{"email":"demo@papertrail.local","password":"paper-trail-demo"}' localhost:8080/api/auth/login | jq -r .accessToken)
curl -s -H "Authorization: Bearer $ACCESS" localhost:8080/api/analytics/summary
```

## Authentication and ownership

- **Passwords**: BCrypt (work factor 12) behind Spring's delegating encoder; 8–72 characters (BCrypt reads
  at most 72 bytes, so longer UTF-8 input is rejected rather than silently truncated). Unknown emails still
  run a hash comparison so response timing doesn't reveal which emails exist.
- **Access tokens**: HS256 JWTs (issuer-checked, 15 minutes, carrying a session id claim), validated by
  Spring Security's resource server. The SPA keeps them **in memory only**.
- **Refresh tokens**: 256-bit random values in an `HttpOnly`, `SameSite=Strict`, path-scoped (`/api/auth`)
  cookie. Only the SHA-256 hash is stored. Every refresh **rotates** the token within its session family.
  Replaying an already-rotated token revokes the whole family (theft detection); a 20-second grace window
  lets two tabs refresh at the same moment. Logout revokes the family. A password change revokes every other
  family.
- **CSRF**: the only endpoints that act on cookies are the `POST /api/auth/*` endpoints, so CSRF protection is
  enforced exactly there (Spring Security double-submit token; the SPA gets a masked token from
  `/api/auth/csrf`). Bearer-authenticated endpoints are not CSRF-prone, and the SPA never sends a bearer token
  to `/api/auth/*`.
- **CORS** comes from `APP_CORS_ALLOWED_ORIGINS`. The bundled setups are same-origin (Vite proxy, nginx).
- **Session expiry in the UI**: on `401` the client performs one shared silent refresh and retries; if the
  session is gone it returns to sign-in with "Your session expired".
- **Ownership**: every query is scoped by the authenticated user id. Another household's ids return the
  same `404` as missing ids, and foreign provider/category ids in a bill are rejected as field errors. The
  database's composite foreign keys enforce the same rule independently. Signed document URLs are issued only
  after the ownership check, and they expire after 5 minutes.

## Recurring bills and reminders

**Recurrence rule** (`RecurrenceRule`): the first instance is the first billing day on or after the start
date, then every 1, 3 or 12 months. Each date is computed from the **original anchor day**, so a schedule on
the 31st produces 31 Jan → 28 Feb (29 in leap years) → 31 Mar → 30 Apr. A leap-day annual schedule falls on
28 Feb and returns to 29 Feb in leap years.

**Generation job** (`RecurringBillJob`, every 15 minutes in UTC, plus once at startup; also run immediately
when a schedule is created, edited or resumed):
- For each active schedule, "today" is computed in **the owner's timezone**, and instances due in
  `[max(start, today, day after the last generated instance), today + 30 days]` are created.
- Each billing cycle is claimed in the `schedule_occurrences` ledger with
  `INSERT … ON CONFLICT (schedule_id, cycle_month) DO NOTHING RETURNING id`, inside the same transaction as
  the bill insert. Repeated runs, overlapping runs and several API instances cannot create duplicates; this
  is verified by a test with 8 concurrent runs.
- **Edits affect the future only**: generated bills are independent records and are never rewritten. A
  changed billing day never adds a second bill for a month that already has one. A deleted generated bill is
  not recreated, because its ledger entry remains. Paused schedules generate nothing.

**Reminders** (`ReminderService`, same job): for unpaid bills only.
- *Due soon* when `today ≥ due date − lead days` (lead time from the schedule or bill, default from settings).
- *Overdue* once, when an unpaid bill passes its due date (for bills up to 7 days overdue).
- De-duplicated by a unique key `(bill_id, type, due date)`: reruns never duplicate, while moving a due date
  legitimately allows a fresh reminder. Paid bills never get due-soon reminders. Each notification links to
  its bill and shows the bill's *current* status.

Email reminders were optional and are not included (in-app notifications only).

## Analytics definitions

All figures are computed in PostgreSQL with `numeric` arithmetic and returned as exact decimal strings
(`"2644.37"`). Every query is restricted to the account's currency, and an account's currency is locked once
bills exist, so amounts in different currencies are never added together.

| Metric | Definition |
|---|---|
| **Outstanding** | Sum of unpaid bills (overdue and not yet due). With a month range: unpaid bills *due* in the range. |
| **Overdue** | Unpaid bills whose due date is before today in the household timezone |
| **Due in the next 7 days** | Unpaid bills due today to today + 6 |
| **Billed (monthly totals)** | Bills grouped by **due date**, whatever their status |
| **Paid (monthly totals)** | Paid bills grouped by **payment date** |
| **By category** | Billed amounts (by due date) per category in the range, with share of total |
| **Provider trends** | Billed amounts (by due date) per provider per month; average = total ÷ months in the range |

Filters: month range (`from`/`to`, default the last 12 months) and provider.

## Tests and verification

| Command | What it checks |
|---|---|
| `cd backend && ./mvnw test` | **61 tests** against a real embedded PostgreSQL 17 with the Flyway schema (no Docker) |
| `cd frontend && npm run lint` | oxlint (0 warnings) |
| `cd frontend && npm run build` | `tsc -b` strict type check + Vite production build |
| `cd e2e && npm install && npx playwright install chromium && npx playwright test` | Browser tests against a running stack (defaults to `http://localhost:4173`; set `E2E_BASE_URL=http://localhost:3000` for Compose) |

Backend coverage:
- **Auth & isolation**: registration, login, CSRF enforcement, expiry of access tokens (controllable clock),
  refresh rotation, reuse grace and theft detection, logout, password change keeping only the current
  session; a household cannot read, change, pay, upload to, link, rename, delete or reference anything
  belonging to another.
- **Bills**: CRUD, validation errors per field, optimistic-lock conflicts, derived overdue status in the
  household timezone, payments, search/filters/sorting/pagination.
- **Money**: exact decimal outstanding/overdue totals (e.g. 0.10 + 0.20 + 1,234,567.89), the balance drop on
  payment, billed-by-due-date vs paid-by-payment-date months, category shares, provider trends, and no mixing
  of currencies.
- **Recurrence**: 31st/30th/29th anchors across short months, leap years, quarterly anchors, plus a
  2,000-case brute-force check of the window maths.
- **Scheduler**: idempotent repeat runs, 8 concurrent runs, per-household timezones (Auckland and
  Los Angeles on the same instant), the 30-day horizon boundary, month-end sequences through real runs,
  edits, deletions and pause.
- **Reminders**: lead time, de-duplication, skipping paid bills, overdue notices, read/unread APIs, fresh
  reminders after a due-date move.
- **Documents**: version numbering, every version retrievable with exact bytes, signed inline/attachment
  links, file-type detection from content (renamed text rejected), size limit, a storage outage leaving no
  record, a failed metadata insert removing the stored object, the archive, and file cleanup on bill delete.
- **Demo seed**: runs twice (replacement), with paid, overdue and upcoming bills and multi-version statements.

**Verified on the build machine (Windows 11, Java 21, Node 24):**
- Backend test suite: 61/61 passing.
- Frontend: strict type check, oxlint and production build all clean.
- Full stack running for real: API on embedded PostgreSQL 17.11, the Silo build of the MinIO server for S3,
  and the production SPA served by `vite preview` with the production CSP. The Playwright E2E flow passed:
  **log in → create a bill → upload two statement versions → download version 1 and compare it byte for
  byte → mark paid → the overview balance rises by exactly €123.45 and then falls back** (followed by
  cleanup). The browser console stayed error-free throughout.
- A PDF preview renders inside the app from a signed storage URL (full Chromium); unsigned bucket access
  returns `403`.
- Screenshots of every screen were captured at desktop (1440px) and phone (390px) widths
  (`npx playwright test --project=screenshots` writes them to `e2e/.artifacts/`) and the main screens were
  reviewed. All 15 routes were measured at 390px with no horizontal overflow.

**Not verified here:** `docker compose up` and the two Dockerfiles. The build machine has no Docker (or
WSL), so the Compose stack, the nginx image and the `minio-init` bucket step have not been executed. They
follow standard images and configuration, and everything they run (API, SPA build, storage server) was
exercised outside containers.

## Design notes

The interface is a contemporary household ledger. It uses warm paper `#F5F3EE`, near-black ink `#171717`,
stone hairlines `#D8D4CB` and one accent, forest green `#245B45`. Headings and the large figures are set in
**Newsreader** (variable, optical sizing); interface text is **IBM Plex Sans**; money and dates use tabular
lining numerals. Sections are separated by full-width rules rather than boxed in cards. Tables are compact
ledgers that become two-line entries on phones. Totals carry a double rule. Status is always spelled out
with a shape (✓ Paid, ○ Unpaid, ! Overdue), so colour is never the only signal.

The chart colours were validated rather than eyeballed. The brand green itself is too dark and too grey for
series identity, so charts use `#2B7A52` (billed) and `#C27A2C` (paid), a pair that passes the lightness,
chroma, colour-blind separation (ΔE 8.2) and ≥3:1 contrast checks on the paper background. Charts follow
the same rules throughout: thin columns, a hairline grid, a tooltip that lists every series, arrow-key
navigation with a live region, and a table view for every chart.

## Known limitations

- **Docker Compose is untested** in this environment (see above). Compose uses `pgsty/silo` because
  upstream MinIO no longer publishes community images.
- **One account = one household.** Shared households and invitations are out of scope.
- **In-app reminders only**; no email.
- **Stateless access tokens** stay valid until they expire (≤ 15 minutes) after logout or a password change.
  Refresh sessions are revoked immediately.
- **No login rate limiting** or account lockout yet.
- **Statement versions are append-only**: a single version can't be deleted (deleting the bill removes all of
  them and their stored files). If both the metadata insert and the compensating object delete fail, an
  orphaned object can remain in the bucket (it is logged; a bucket lifecycle rule can sweep the prefix).
- **Generation doesn't back-fill**: cycles before today aren't created when a schedule starts in the past.
  Overdue reminders are only sent for bills up to 7 days overdue. Changing a schedule's start date or
  frequency starts a new cadence, which can put two bills in adjacent months.
- **Currency** is fixed once bills exist; there is no conversion between currencies.
- **Light theme only**; there is no dark mode.
- **The live demo is simulated.** It runs a TypeScript port of the API in the browser, so it shows the
  product and its rules, not the Java service, PostgreSQL or S3. Each browser keeps its own copy of the data.
- Inline PDF preview depends on the browser's PDF viewer (headless test browsers render it blank; the Download
  action always works).
