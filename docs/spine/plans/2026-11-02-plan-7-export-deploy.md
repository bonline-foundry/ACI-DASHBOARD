# Plan 7 — Excel export, polish, deploy Implementation Plan

> **For agentic workers:** Executed inline (executing-plans). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Export the Spend and Billing tables to Excel, finish small polish items, and deploy the app to Vercel on the Neon `production` branch.

**Architecture:** `src/server/export.ts` builds workbooks from the existing read models (`spendMatrix`, `listSpendEntries`, `listBills`), so the export always matches what the page shows. Two route handlers stream the files. Deploy uses the Vercel project with `DATABASE_URL` pointing at the Neon production branch; migrations and reference seed run once against production before the first deploy.

**Tech Stack:** Next.js 16 route handlers, SheetJS, Vitest, Playwright, Vercel, Neon.

## Global Constraints

- Exports reuse the page filters from the URL (spend: month, brand, group; bills: q, status, brand, age).
- Amounts in exports are whole taka (numbers, not text), with VAT, so Excel can sum them.
- File names: `aci-spend-<month>.xlsx`, `aci-bills-<today>.xlsx`.
- Deploy only after the user confirms. Production gets migrations + reference data only, no demo data.
- The app has no login. Before it goes online, access must be limited (Vercel deployment protection) or the user must accept a public URL.

---

## Seams

```ts
// src/server/export.ts
export function spendWorkbook(db: Db, q: { month: string; brandId?: number; group?: ChannelGroup }): Promise<Uint8Array>; // sheets "Spend by month", "Entries"
export function billsWorkbook(db: Db, today: string, f: BillFilter): Promise<Uint8Array>;                              // sheet "Bills"
export const XLSX_TYPE: string;

// routes
// GET /api/export/spend?month=&brand=&group=
// GET /api/export/bills?q=&status=&brand=&age=
```

## Tasks

- [x] **Task 1: Export server** — `export.ts` + `export.test.ts` (read the workbook back: headers, numbers, filters).
- [x] **Task 2: Routes + buttons** — route handlers, "Export to Excel" links on Spend and Billing; e2e checks the download.
- [x] **Task 3: Polish** — shared filter parsing, page titles per route, not-found and error pages.
- [x] **Task 4: Verify + commit** — tsc, lint, unit, build, e2e.
- [ ] **Task 5: Deploy (after user confirms)** — migrate + seed Neon production, Vercel project and env, deploy, smoke test.
