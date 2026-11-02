# ACI Media Dashboard — Plan 3: Upload Pipeline, Spend, Uploads & History

> **For agentic workers:** Execute task-by-task, test-first. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A reusable Excel upload flow (preview → checks → confirm → versioned save → restore) wired for the **Spend** and **Plan** templates; a working Spend page (brand × month table by media, TV station and agency breakdowns, manual add/edit/delete); and an Uploads & History page.

**Architecture:** `src/server/uploads.ts` owns the pipeline and delegates kind-specific work to an `Applier` per upload kind (`src/server/appliers/*.ts`). All confirm/restore writes run in one DB transaction. The client `UploadPanel` posts the file (FormData) to `previewUploadAction` and then `confirmUploadAction`; it is reused by later modules by passing `kind`.

## Global Constraints

Same as Plans 1–2. Server action body limit: `4mb` (stays under Vercel's 4.5 MB request cap). Upload replace scope = same kind + the periods (months) the file covers. Manual rows win over uploaded rows with the same key. Duplicate file (same SHA-256 as a confirmed upload) is blocked. Total mismatch must be explicitly accepted. Unknown brand names block the upload; unknown vendors / TV stations are created on confirm (listed in preview).

## Seams

| File | Interface |
|---|---|
| `src/server/lookups.ts` | `loadLookups(db): Promise<Lookups>`; `Lookups = { brand(name): number \| undefined; channel(name): number \| undefined; vendor(name); tvStation(name); rival(brandId, name) }` — case/space-insensitive; channel aliases `facebook`/`instagram`/`fb` → META, `newspaper`/`print` → PRESS, `outdoor` → OOH, `yt` → YOUTUBE |
| `src/server/appliers/types.ts` | `type Applier = { kind; resolve(db, rows: ParsedRow[], lk: Lookups): Promise<{ items: Item[]; errors: RowError[]; missing: Missing }>; createMissing(db, missing): Promise<void>; existingKeys(db, periods: string[]): Promise<{ key: string; source: "upload" \| "manual" }[]>; replace(tx, periods, items, uploadId): Promise<number> }`; `Item = { key: string; [k: string]: unknown }`; `Missing = { vendors: string[]; tvStations: string[] }` |
| `src/server/appliers/spend.ts` | key = `brandId|month|channelId|tvStationId|vendorId|entryDate` |
| `src/server/appliers/plan.ts` | groups rows by brand+campaign+start+end → one campaign with lines; key = `brandId|lower(name)|startDate`; periods by start month |
| `src/server/uploads.ts` | `previewUpload(db, { kind, fileName, data }): Promise<UploadPreview>`; `confirmUpload(db, { kind, fileName, data, acceptMismatch }): Promise<{ uploadId; inserted; skippedManual }>`; `restoreUpload(db, uploadId)`; `listUploads(db)`; `listHistory(db, { entity?, limit })` |
| `UploadPreview` | `{ fileName, kind, fileHash, ok: boolean, checks: { label: string; status: "pass" \| "review" \| "fail"; detail?: string }[], rowCount, periods, totals: { status, rowsTotal, controlTotal, diff }, errors: RowError[], missing: Missing, conflicts: number, sample: Record<string, CellValue>[] }` |
| `src/server/spend.ts` | `createSpendEntry(db, SpendInput)`, `updateSpendEntry(db, id, SpendInput)`, `deleteSpendEntry(db, id)`, `listSpendEntries(db, { month, brandId? })`, `spendMatrix(db, { months, brandId?, group? })`, `spendBreakdown(db, { month, brandId?, by: "tvStation" \| "vendor" })`; `SpendInput = { brandId, month, entryDate?, channelId, tvStationId?, vendorId?, amount, note? }`; `ChannelGroup = "TV" \| "PRESS" \| "RADIO" \| "OOH" \| "DIGITAL"` |

## Tasks

1. **Lookups + appliers + pipeline (TDD, PGlite).** Tests: preview flags missing columns / row errors / unknown brand / duplicate hash / total mismatch / new vendors; confirm blocks mismatch unless accepted; confirm inserts rows with `source=upload`, keeps manual rows and counts skipped; re-upload of the same month replaces prior upload rows and marks prior upload `superseded`; restore re-applies old snapshot and flips statuses; plan upload groups lines into campaigns; every confirm/restore logs history.
2. **Spend services (TDD).** Manual CRUD validation and history; matrix sums by brand × month with channel group filter and per-cell source summary (`upload` / `manual` / `mixed`); breakdown by TV station and vendor.
3. **UI.** `UploadPanel` (client) with drag-drop/choose, checks list (Passed / Review / Failed chips), errors table, missing names, sample preview, mismatch checkbox, Confirm/Cancel, template download link. Spend page: FilterBar, 4-month matrix with media tabs and source tags, month entries table with edit/delete dialog, add-entry form, TV station + agency breakdown cards, UploadPanel(kind="spend"). Plan page gets UploadPanel(kind="plan"). Uploads & History page: uploads table with Restore, history table with entity filter.
4. **E2E + commit.** Upload a generated spend xlsx (with TOTAL mismatch → must accept), see totals on Spend and actual spend on Plan budget table; re-upload same file is blocked; manual add entry; Uploads page shows version and history.
