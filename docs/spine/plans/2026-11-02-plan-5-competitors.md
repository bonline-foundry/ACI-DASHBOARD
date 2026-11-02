# Plan 5 — Competitor Tracking Implementation Plan

> **For agentic workers:** Executed inline (executing-plans). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build the Competitor Tracking module: each brand against its 3 rivals for TV / Press / Radio, a Meta and TikTok ad log, a YouTube monthly snapshot, and a sources table with owners and last-updated dates.

**Architecture:** One server module `src/server/competitors.ts` owns validation, writes with history, source "last updated" stamps and read models. A `competitor_media` upload applier plugs into `APPLIERS`. The page follows the Performance / Digital pattern: Suspense + `connection()`, brand + month filter, CSS bar chart, client dialogs calling server actions.

**Tech Stack:** Next.js 16 App Router, Drizzle + Neon (PGlite in tests), Vitest, Playwright.

## Global Constraints

- Money is whole taka with VAT. Months are `YYYY-MM`. Percentages are 0–100.
- A "subject" is the brand itself (`rivalId = null`) or one of its rivals. A rival must belong to the brand.
- One competitor media row per brand + month + subject + media (enforced in app, and in uploads).
- Share of voice in the chart = subject spend ÷ total spend of the brand and its rivals that month × 100. A reported share of voice stays visible per row.
- Every write logs history (actor "Admin") and stamps the matching source's `last_updated_at`.
- Sources: `competitor_media` (TV, Press, Radio upload), `meta_ads`, `youtube`, `tiktok_ads`. A source is stale after 35 days.
- Manual edits win over re-uploads. Ad links are stored as links only (no images).

---

## Seams

```ts
// src/server/competitors.ts
export type CompetitorMediaType = "TV" | "Press" | "Radio";
export type SourceKey = "competitor_media" | "meta_ads" | "youtube" | "tiktok_ads";
export function parseMediaType(s: string): CompetitorMediaType | null;
export function touchSource(db: Db, key: SourceKey): Promise<void>;
export function listSources(db: Db, today: string): Promise<SourceRow[]>;            // label, ownerName, lastUpdatedAt, stale
export function setSourceOwner(db: Db, key: SourceKey, ownerName: string): Promise<void>;

export type CompetitorMediaInput = { brandId; month; rivalId: number | null; media; spend?; spots?; shareOfVoice? };
export function saveCompetitorMedia(db: Db, id: number | null, input: CompetitorMediaInput): Promise<Row>;
export function deleteCompetitorMedia(db: Db, id: number): Promise<void>;
export function listCompetitorMedia(db: Db, q: { brandId: number; month: string }): Promise<CompetitorMediaView[]>;
export function competitorOverview(db: Db, q: { brandId: number; month: string }): Promise<SubjectSummary[]>;
// SubjectSummary = { key, rivalId, name, isOwn, spend, spots, shareOfVoice: number | null, byMedia: Record<media, { spend, spots }> }

export type CompetitorAdInput = { brandId; rivalId; platform: "Meta" | "TikTok"; adUrl?; startedOn?; hook?; cta?; visualStyle?; tone?; notes? };
export function saveCompetitorAd(db: Db, id: number | null, input: CompetitorAdInput): Promise<Row>;
export function deleteCompetitorAd(db: Db, id: number): Promise<void>;
export function listCompetitorAds(db: Db, q: { brandId: number }): Promise<CompetitorAdView[]>;

export type YoutubeRowInput = { rivalId: number | null; subscribers?; totalViews?; videos?; latestUploadOn? };
export function saveYoutubeMonth(db: Db, input: { brandId; month; rows: YoutubeRowInput[] }): Promise<{ saved; removed }>;
export function listYoutube(db: Db, q: { brandId: number; month: string }): Promise<YoutubeView[]>; // with subscriber change vs last month

// src/server/appliers/competitor-media.ts
export const competitorMediaApplier: Applier<CompetitorMediaItem>; // key brand|month|rival|media
```

## Tasks

- [x] **Task 1: Server module** — `competitors.ts` + `competitors.test.ts`: validation (rival of another brand, bad media, negatives, SOV > 100, duplicate subject/media, bad URL, date), history, source stamps, overview math, YouTube grid upsert/delete and month-on-month change, stale sources.
- [x] **Task 2: Upload applier** — `appliers/competitor-media.ts`, register; tests in `uploads.test.ts` (own brand vs rival names, unknown rival, repeated rows, manual kept).
- [x] **Task 3: Page** — `/competitors`: brand + month filter (no "All brands"), rivals line, share-of-voice chart, spend and spots by media, media entries dialog, ad log dialog, YouTube snapshot dialog, sources table with editable owner, upload panel.
- [x] **Task 4: e2e + verify** — `e2e/competitors.spec.ts`; tsc, lint, unit, build, e2e; commit.
