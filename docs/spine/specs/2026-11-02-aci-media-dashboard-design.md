# ACI Media Dashboard — Design (v1, single user, manual data)

Date: 2026-11-02 · Status: approved by user (FRAME)
Sources: `ACI Media Dashboard Deep Research.pdf`, `ACI Media Dashboard User Flow and Wireframes.html` (13 screens; no Plan screen existed — designed here).

## Goal

One working web dashboard that holds ACI's media work in six modules — Plan, Spend, Performance, Digital Data, Competitor Tracking, Billing — with all data entered by hand or uploaded from Excel templates. Built for a client presentation, but every feature must really work and persist to a database. Campaign planning by date is the main focus.

## Stack (see `.spine/config.md`)

Next.js App Router + TypeScript + Tailwind + shadcn/ui + Recharts; Drizzle ORM + Neon Postgres (serverless driver); SheetJS for Excel parse and template generation; Vitest + Playwright; deploy to Vercel. No login.

## Approach

**A — ACI-defined Excel templates.** Each upload type has a downloadable `.xlsx` template with fixed column headers. Upload pipeline: parse → automatic checks → preview → user confirms → saved as a new version. Rejected: importers for ACI's original files (files unavailable, formats inconsistent); generic column-mapping wizard (more build, slower use). Original-format importers may be added later.

## Global rules

- Currency: BDT, stored as whole taka (integer). Displayed in million BDT (2 decimals) unless small. All amounts are **with VAT**; label "Costs with VAT" on every money page.
- Every data row carries `source` (`upload` | `manual`), `upload_version_id` (nullable), `updated_at`. UI shows source + last-updated on every number block.
- Every create/update/delete appends to `history_log` (actor "Admin", entity, entity id, action, before/after JSON, reason, timestamp).
- Empty states: a brand/month with no data shows a clear message plus "Add" / "Upload" actions, never a blank chart.
- Filters: brand (or All) and month, kept in the URL query string.
- Alert thresholds (editable in Settings): bill yellow ≥15 days, red ≥30 days unpaid; budget orange ≥90%, red ≥100% used.
- Responsive: desktop first, readable on phone width.

## Data model (Drizzle tables)

- `businesses` (id, name) — Toiletries, Hygiene, Salt, Electrolyte.
- `brands` (id, business_id, name, active).
- `rivals` (id, brand_id, name, sort) — max 3 per brand (enforced in app).
- `channels` (id, code, name, parent_id) — TV, Press, Radio, OOH, Digital; Digital children Meta, YouTube, TikTok.
- `tv_stations` (id, name); `vendors` (id, name, kind: agency|media|other).
- `budgets` (id, brand_id, month `YYYY-MM`, amount) — unique (brand, month).
- `campaigns` (id, brand_id, name, start_date, end_date, status planned|live|done, notes, source, upload_version_id, updated_at).
- `campaign_lines` (id, campaign_id, channel_id, planned_amount).
- `spend_entries` (id, brand_id, month, date nullable, channel_id, tv_station_id nullable, vendor_id nullable, amount, note, source, upload_version_id, updated_at).
- `performance_entries` (id, brand_id, month, channel_id, spend, people_reached, grp, share_of_voice, share_of_spend, reach_1plus, cprp, source, …) — unique (brand, month, channel).
- `digital_entries` (id, brand_id, month, platform channel_id, spend, reach, impressions, cpm, thruplays, cost_per_view, engagement, source, …) — unique (brand, month, platform).
- `competitor_media` (id, brand_id, month, subject: own|rival_id, media TV|Press|Radio, spend, spots, share_of_voice, source, …).
- `competitor_ads` (id, brand_id, rival_id, platform Meta|TikTok, ad_url, started_on, hook, cta, visual_style, tone, notes, …).
- `competitor_youtube` (id, brand_id, month, subject own|rival_id, subscribers, total_views, videos, latest_upload_on, …).
- `source_owners` (id, source_key, owner_name, last_updated_at) — per competitor source.
- `bills` (id, bill_no unique, po_no, vendor_id, brand_id, month, bill_date, amount, vat_amount, status unpaid|payment_done|cheque_in_hand|finance_audit|bill_error|cheque_in_counter, paid_at, note, source, …).
- `reminders` (id, bill_id, created_at, resolved_at).
- `uploads` (id, kind, file_name, file_hash, period, row_count, control_total nullable, rows_total, status pending|confirmed|superseded|rolled_back, created_at).
- `settings` (key, value JSON) — thresholds.
- `history_log` (as above).

## Modules

### Home
Top row: budget status per brand for selected month (used %, colour by threshold); bills waiting by age bucket (0–14, 15–29, 30+) with "Remind"; best-reach channel (lowest cost per 1,000 reached). Below: campaigns starting in next 14 days and live now; alerts list (bill 30+, budget ≥90%, upload needs review, competitor source stale >35 days).

### Plan (primary)
- Views: **Timeline** (default; rows = brands, bars = campaigns from start to end date, colour by main channel, horizontal scroll by month), **Month calendar**, **List** (sortable table).
- Add/edit campaign dialog: brand, name, dates, status, notes, per-channel planned cost lines.
- Plan vs budget vs actual per brand-month: planned (pro-rated by days of campaign in month), budget, actual spend; gap flagged when planned > budget or actual > budget.
- Budget: set/edit monthly budget per brand with a required reason (logged).
- Upload: Plan template (one row per campaign × channel).

### Spend
Brand × month table with media tabs (All/TV/Digital/Press/OOH/Radio); TV station list; agency/vendor list. Manual add/edit row; upload Spend template; export table to Excel.

### Performance (manual input)
Grid form per brand-month: one row per channel with spend and people reached; TV-only native fields. Computed `cost per 1,000 reached = spend / people_reached × 1000`. Bar chart lower-is-better with toggle Both/TV/Digital; native numbers table underneath. Missing channels show "no data" bars.

### Digital Data (manual input / upload)
Per brand-month-platform entry form and table; charts: reach by platform, cost per view by platform; digital spend by business (summed from Spend). Upload Digital template.

### Competitor Tracking (manual)
Brand selector shows its 3 rivals. Share-of-voice chart (brand vs rivals, month); spend and spots by media. Sources table (TV/Print/Radio upload, Meta ad log, YouTube snapshot, TikTok log) with owner name + last updated, editable owner. Meta/TikTok ad log with add entry; YouTube monthly snapshot form. Upload Competitor Media template.

### Billing
Age-bucket counters + "paid this month". Filterable table (search, status, brand, age). Status chips (Payment Done green, Cheque in Hand blue, Cheque in Counter blue, Finance/Audit amber, Bill Error red, Unpaid grey). Row actions: Mark paid (sets paid_at, status payment_done), Remind (creates in-app reminder, shows on Home), Note. Detail panel with PO, amount, VAT, status, history. "Check these bills" list = unpaid ≥30 days. Age = today − bill_date while not paid. Upload Billing template; export.

### Uploads & History
List of uploads with kind, file, period, rows, status, totals; open a version, restore (rolls back to that version's rows for its kind+period). History log table filterable by entity and date.

### Settings
Master data CRUD (businesses, brands, rivals ≤3, channels fixed list, TV stations, vendors); thresholds; download all templates.

## Upload pipeline (all kinds)

1. Accept `.xlsx`/`.xls`/`.csv` only.
2. Parse first sheet; headers must match template (case/space-insensitive). Unknown brand/rival/vendor names are listed for the user to create or fix.
3. Checks: file type; period found (month column or filename); duplicate (same SHA-256 as a confirmed upload → blocked); optional `TOTAL` row: if control total ≠ sum of rows, flag "Totals differ by X" — user must confirm to continue; row-level validation errors listed with row numbers.
4. Preview rows; user clicks **Confirm and save**.
5. Save: new `uploads` record; for the same kind + period, previous upload-sourced rows are superseded (soft-replaced); **rows with source = manual are kept**, and if an uploaded row hits the same key as a manual row, the manual row wins and the conflict is listed.
6. History log entry.

## Out of scope (v1)

Login, roles, approvals; email notifications; live Meta/YouTube/TikTok API links; importers for ACI's original file layouts; storing images/files of rival ads (links only); native mobile app; multi-company; currencies other than BDT.

## Testing

Vitest: template parsing + header matching, total-mismatch check, duplicate hash check, manual-wins merge, bill aging + bucket, budget threshold colour, cost per 1,000 reach, plan pro-rating by month. Playwright: add campaign and see it on timeline; upload spend template and confirm; mark bill paid and it leaves the overdue list.

## Open items

- Neon project not yet created; config Gate C (boot assertion) closes once project/branch names are pinned.
- Real rival names per brand to be entered by the client in Settings.
