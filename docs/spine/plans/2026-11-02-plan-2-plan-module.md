# ACI Media Dashboard — Plan 2: Plan Module (campaigns, budgets, plan vs actual)

> **For agentic workers:** Execute task-by-task, test-first. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A working Plan page where the user adds, edits and deletes date-based campaigns (per-channel planned cost), sees them on a timeline, month calendar and list, sets monthly budgets with a reason, and compares budget vs planned vs actual spend per brand.

**Architecture:** Pure layout math in `src/lib/timeline.ts` (unit-tested). Data access in `src/server/plan.ts` (PGlite-tested). Page `src/app/(modules)/plan/page.tsx` is a server component that reads `?month=YYYY-MM&brand=<id>&view=timeline|calendar|list` inside `<Suspense>` (Next 16 `cacheComponents`). Writes go through server actions in `plan/actions.ts`; the campaign dialog is a client component calling the action directly.

**Spec:** `docs/spine/specs/2026-11-02-aci-media-dashboard-design.md` → "Plan (primary)". Upload of the Plan template is Plan 3 (generic upload pipeline).

## Global Constraints

Same as Plan 1. Plus: today's date is computed in `Asia/Dhaka`. Every campaign write sets `source = "manual"` (manual edits win) and logs to history. Budget changes require a non-empty reason.

## Seams

| File | Interface |
|---|---|
| `src/lib/month.ts` (add) | `todayDhaka(now?: Date): string`, `addMonths(month: string, n: number): string`, `daysInMonth(month: string): number`, `monthBounds(month): { start: string; end: string }` |
| `src/lib/timeline.ts` | `type Span = { id: number; start: string; end: string }`; `barPosition(start, end, month): { offset: number; span: number } \| null` (0-based day offset within month, clipped); `assignLanes(items: Span[]): Map<number, number>` (greedy, earliest start first, non-overlapping per lane) |
| `src/lib/channel-colors.ts` | `CHANNEL_COLORS: Record<string, string>` (Tailwind bg/text classes by channel code); `mainChannel(lines: { code: string; plannedAmount: number }[]): string \| null` |
| `src/server/plan.ts` | `type CampaignInput = { brandId: number; name: string; startDate: string; endDate: string; status: "planned" \| "live" \| "done"; notes?: string \| null; lines: { channelId: number; plannedAmount: number }[] }`; `createCampaign(db, input)`, `updateCampaign(db, id, input)`, `deleteCampaign(db, id)`, `listCampaigns(db, { from: string; to: string; brandId?: number }): Promise<CampaignView[]>`, `setBudget(db, { brandId, month, amount, reason })`, `planVsBudget(db, month, brandId?): Promise<BudgetRow[]>`, `listChannels(db)` |
| `CampaignView` | `{ id, brandId, brandName, name, startDate, endDate, status, notes, source, updatedAt, total, lines: { channelId, code, name, plannedAmount }[] }` |
| `BudgetRow` | `{ brandId, brandName, budget: number \| null, planned: number, actual: number, level: BudgetLevel, pct: number \| null, plannedOverBudget: boolean }` — `pct`/`level` from `actual` vs `budget` with saved thresholds; `planned` = sum of `prorateByMonth` of each line for the month |
| `src/components/data/filter-bar.tsx` | `<FilterBar month brands brandId? extra? />` — GET form updating `month`/`brand` URL params, keeps `view` |

## Tasks

### Task 1: Month helpers + timeline math
Tests (`src/lib/timeline.test.ts`, extend `month-money.test.ts`):
- `todayDhaka(new Date("2026-11-01T20:00:00Z"))` → `"2026-11-02"`; `addMonths("2026-12", 1)` → `"2027-01"`; `addMonths("2026-01", -1)` → `"2025-12"`; `daysInMonth("2028-02")` → 29; `monthBounds("2026-10")` → `{ start: "2026-10-01", end: "2026-10-31" }`.
- `barPosition("2026-10-05","2026-10-10","2026-10")` → `{ offset: 4, span: 6 }`; clipped `("2026-09-20","2026-10-03","2026-10")` → `{ offset: 0, span: 3 }`; `("2026-10-30","2026-11-04","2026-10")` → `{ offset: 29, span: 2 }`; outside → `null`.
- `assignLanes` puts overlapping spans in different lanes and reuses lane 0 after a gap.
- `mainChannel` picks the largest planned amount; empty → `null`.

### Task 2: Plan services
Tests (`src/server/plan.test.ts`, PGlite):
- create validates: empty name, bad dates, end before start, no lines, negative/non-integer amount, unknown brand → `ValidationError`.
- create + list returns lines with channel codes, `total`, `source: "manual"`, logs `campaign/create`.
- list window filter: only campaigns overlapping `[from, to]`; brand filter.
- update replaces lines and logs before/after; delete removes and logs.
- setBudget upserts, requires reason, rejects negative; logs with reason.
- planVsBudget: campaign 2026-10-22..2026-11-10 TV 1,000,000 → October planned 500,000; spend entries for October summed as actual; budget 1,000,000 + actual 950,000 → `orange`; planned > budget flag; brand without budget → `no-budget`.

### Task 3: Plan page UI
- `FilterBar`, page with Suspense, view tabs (links), month prev/next.
- Timeline: rows = active brands (or filtered brand), day columns, bars by lane, colour by main channel, today marker, click bar → edit dialog.
- Calendar: 7-column month grid (Mon start), up to 3 chips per day + "+n more".
- List: table with brand, campaign, dates, status, channels, total (M), source tag.
- Budget panel: per-brand budget, planned, actual, % used, status chip; "Set budget" form (brand, amount in BDT, reason).
- Campaign dialog: brand, name, start/end, status, notes, channel lines (add/remove), shows total; Save/Delete.
- Empty states when no brands (link to Settings) or no campaigns.

### Task 4: E2E + commit
`e2e/plan.spec.ts`: create brand via Settings, add campaign in dialog, see it on timeline and list, set budget and see status row. Run build, unit, e2e. Commit.
