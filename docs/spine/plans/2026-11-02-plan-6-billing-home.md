# Plan 6 — Billing + Home Implementation Plan

> **For agentic workers:** Executed inline (executing-plans). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build the Billing module (unpaid bills by age, status chips, Mark paid / Remind / Note, "Check these bills", bill upload) and the Home page (budget status, bills by age, best-reach channel, upcoming and live campaigns, alerts).

**Architecture:** `src/server/billing.ts` owns bill writes, reminders, age buckets and summaries. `src/server/home.ts` composes read models from Plan, Billing, Performance, Uploads and Competitors into one `homeData` call, including the alert rules. A `bills` upload applier plugs into `APPLIERS`. Pages follow the existing Suspense + `connection()` pattern.

**Tech Stack:** Next.js 16 App Router, Drizzle + Neon (PGlite in tests), Vitest, Playwright.

## Global Constraints

- Money is whole taka with VAT. Months are `YYYY-MM`. "Today" is the Asia/Dhaka date.
- A bill is paid when status is `payment_done`. Age = today − bill date while not paid; buckets from Settings thresholds (default yellow 15 days, red 30 days).
- Mark paid sets status `payment_done` and `paid_at`, and closes open reminders. Leaving `payment_done` clears `paid_at`.
- Any manual change to a bill (edit, mark paid, note, status) makes it `source = manual`, so a re-upload keeps it.
- Bill numbers are unique (case-insensitive match on upload). A re-upload replaces earlier uploaded rows with the same bill number.
- Alerts: bill at red age, budget at orange or red, an upload in the last 30 days whose totals did not match, a competitor source last updated more than 35 days ago.
- Every write logs history (actor "Admin").

---

## Seams

```ts
// src/server/billing.ts
export type BillStatus = "unpaid" | "payment_done" | "cheque_in_hand" | "cheque_in_counter" | "finance_audit" | "bill_error";
export const BILL_STATUS_LABELS: Record<BillStatus, string>;
export function parseBillStatus(s: string | null): BillStatus | null;
export type BillInput = { billNo; poNo?; vendorId?; brandId?; month; billDate; amount; vatAmount?; status?; paidAt?; note? };
export function saveBill(db: Db, id: number | null, input: BillInput): Promise<Bill>;
export function deleteBill(db: Db, id: number): Promise<void>;
export function markBillPaid(db: Db, id: number, paidOn: string): Promise<void>;
export function setBillNote(db: Db, id: number, note: string): Promise<void>;
export function remindBill(db: Db, id: number): Promise<void>;              // no-op if one is open
export function resolveReminder(db: Db, reminderId: number): Promise<void>;
export type BillFilter = { search?; status?: BillStatus; brandId?; age?: "fresh" | "yellow" | "red" | "paid" };
export function listBills(db: Db, today: string, f?: BillFilter): Promise<BillView[]>; // ageDays, bucket, openReminderId
export function billSummary(db: Db, today: string): Promise<BillSummary>;  // per bucket count+amount, paidThisMonth
export function listOpenReminders(db: Db, today: string): Promise<ReminderView[]>;
export function billHistory(db: Db, id: number): Promise<HistoryRow[]>;

// src/server/home.ts
export function homeData(db: Db, q: { today: string; month: string }): Promise<HomeData>;
// HomeData = { budgets: BudgetRow[]; bills: BillSummary; reminders; bestReach: { month; row } | null; live; startingSoon; alerts: Alert[] }

// src/server/appliers/bills.ts
export const billsApplier: Applier<BillItem>; // key = lower(billNo)
```

## Tasks

- [x] **Task 1: Billing server** — `billing.ts` + tests: validation, unique bill no, mark paid closes reminders, status change clears paid date, filters, buckets with custom thresholds, summary, history.
- [x] **Task 2: Bills applier** — `appliers/bills.ts`, register, tests in `uploads.test.ts` (status words, missing vendors created, manual bills kept, same bill no in another month replaced).
- [x] **Task 3: Home server** — `home.ts` + tests: budget rows, best reach falls back to latest month with data, live vs starting in 14 days, each alert rule.
- [x] **Task 4: Billing page** — counters, filters, "Check these bills", table with row actions, bill dialog with history, upload panel.
- [x] **Task 5: Home page** — budget cards, bills by age with reminders, best reach, campaigns, alerts.
- [x] **Task 6: e2e + verify** — `e2e/billing.spec.ts`, `e2e/home.spec.ts`; tsc, lint, unit, build, e2e; commit.
