# Plan 4 — Performance + Digital Data Implementation Plan

> **For agentic workers:** Executed inline (executing-plans). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build the Performance module (cost per 1,000 people reached by channel, manual grid + upload) and the Digital Data module (Meta / YouTube / TikTok results, manual entries + upload).

**Architecture:** Two server modules (`src/server/performance.ts`, `src/server/digital.ts`) own validation, writes with history, and read models. Two upload appliers plug into the existing `APPLIERS` map in `src/server/uploads.ts`. Pages follow the Spend page pattern: Suspense + `connection()`, FilterBar, CSS bar charts (no chart library), client dialogs calling server actions.

**Tech Stack:** Next.js 16 App Router, Drizzle + Neon (PGlite in tests), Vitest, Playwright.

## Global Constraints

- Money is whole taka (integer), with VAT. Months are `YYYY-MM`.
- Every write sets `source` and is logged to `history_log` (actor "Admin").
- Manual edits win over re-uploads (`planMerge`).
- Cost per 1,000 reached = spend / people reached × 1000; lower is better; missing reach shows "No data".
- TV-only native fields: GRP, share of voice %, share of spend %, 1+ reach %, cost per rating point.
- Digital platforms are channels whose parent is DIGITAL (Meta, YouTube, TikTok).
- e2e runs only on the Neon dev branch and cleans up `E2E %` brands and `e2e-%` uploads.

---

## Seams

```ts
// src/server/performance.ts
export type PerformanceRowInput = { channelId: number; spend: number | null; peopleReached?: number | null;
  grp?: number | null; shareOfVoice?: number | null; shareOfSpend?: number | null; reach1Plus?: number | null; cprp?: number | null };
export function savePerformanceMonth(db: Db, input: { brandId: number; month: string; rows: PerformanceRowInput[] }): Promise<{ saved: number; removed: number }>;
export function listPerformance(db: Db, q: { month: string; brandId?: number }): Promise<PerformanceView[]>;
export type ReachView = "all" | "TV" | "DIGITAL";
export function reachCost(db: Db, q: { month: string; brandId?: number; view?: ReachView }): Promise<ReachCostRow[]>;
// ReachCostRow = { channelId, code, name, spend, peopleReached, costPer1000: number | null }, sorted cheapest first, no-data last

// src/server/digital.ts
export type DigitalInput = { brandId; month; platformId; spend?; reach?; impressions?; cpm?; thruplays?; costPerView?; engagement? };
export function saveDigitalEntry(db: Db, id: number | null, input: DigitalInput): Promise<DigitalRow>;
export function deleteDigitalEntry(db: Db, id: number): Promise<void>;
export function listDigital(db: Db, q: { month: string; brandId?: number }): Promise<DigitalView[]>; // cpm / costPerView derived when blank
export function digitalSummary(db: Db, q: { month: string; brandId?: number }): Promise<PlatformSummary[]>;
export function digitalSpendByBusiness(db: Db, q: { month: string }): Promise<{ name: string; amount: number }[]>;
export function listDigitalPlatforms(db: Db): Promise<{ id: number; code: string; name: string }[]>;

// src/server/appliers/performance.ts, digital.ts
export const performanceApplier: Applier<PerformanceItem>; // key brand|month|channel
export const digitalApplier: Applier<DigitalItem>;         // key brand|month|platform
```

`Lookups` gains `channelCode(id: number): string | undefined`.

## Tasks

- [x] **Task 1: Performance server module** — `src/server/performance.ts` + `performance.test.ts`.
  Tests: rejects bad month, unknown brand/channel, negative or fractional spend/reach, % outside 0–100, TV fields on non-TV channel; grid save upserts rows, deletes rows left blank, marks source manual, logs history; `reachCost` sums across brands, sorts cheapest first, no-data last, filters by view.
- [x] **Task 2: Digital server module** — `src/server/digital.ts` + `digital.test.ts`.
  Tests: rejects non-digital platform, duplicate brand/month/platform, negatives; update switches source to manual; derived CPM and cost per view; summary per platform; digital spend by business reads Spend.
- [x] **Task 3: Upload appliers** — `appliers/performance.ts`, `appliers/digital.ts`, register in `uploads.ts`, `channelCode` lookup. Tests in `uploads.test.ts`: confirm inserts, duplicate rows in one file fail, manual rows kept on re-upload, non-digital platform fails.
- [x] **Task 4: Performance page** — reach chart with Both/TV/Digital tabs, TV numbers table, results grid dialog (`Save results`), entries table, upload panel.
- [x] **Task 5: Digital page** — platform tiles, reach and cost-per-view charts, digital spend by business, entries table with add/edit/delete dialog, upload panel.
- [x] **Task 6: e2e + verify** — `e2e/performance.spec.ts`, `e2e/digital.spec.ts`; run tsc, lint, unit, build, e2e; commit.
