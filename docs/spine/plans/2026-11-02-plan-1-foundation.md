# ACI Media Dashboard — Plan 1: Foundation & Dev Environment

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-dev (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A running Next.js app with tooling, database schema + migrations, shared domain rules, the Excel upload core, master-data services, and the app shell with a working Settings page — the base every module plan builds on.

**Architecture:** Next.js App Router app in `aci-media-dashboard/`. Pure domain logic in `src/lib/` (no DB, fully unit-tested). Data access through Drizzle; services in `src/server/` take a `Db` argument so they run against Neon in the app and in-memory PGlite in tests. UI pages are server components; writes go through server actions that call services.

**Tech Stack:** Next.js (latest, App Router, TypeScript, Turbopack), Tailwind CSS v4, shadcn/ui, Recharts (later plans), Drizzle ORM + drizzle-kit, `@neondatabase/serverless`, `@electric-sql/pglite` (tests), SheetJS `xlsx` 0.20.3 (CDN tarball), date-fns, Vitest, Playwright.

**Spec:** `docs/spine/specs/2026-11-02-aci-media-dashboard-design.md` · **Config:** `.spine/config.md`

**Plan series (each its own plan file, written after the previous one ships):**
1. Foundation & dev environment (this plan)
2. Plan module (campaign timeline/calendar/list, budgets, plan vs budget vs actual) + shared FilterBar
3. Upload pipeline UI + Spend module + Uploads & History page
4. Performance + Digital Data
5. Competitor Tracking
6. Billing + Home page
7. Polish, Excel export, Vercel deploy on Neon `main`

## Global Constraints

- App folder: `D:\Dashboard Research\aci-media-dashboard` (all paths below are relative to it unless they start with `.spine/` or `docs/`).
- Git repo root: `D:\Dashboard Research`. Never commit `.env*.local`.
- Money: BDT whole taka stored as integer (`bigint` mode number). Display in million BDT with 2 decimals. All amounts are with VAT.
- Month format everywhere: `YYYY-MM` string. Date format: `YYYY-MM-DD` string.
- Every data row carries `source` (`upload` | `manual`), `upload_id`, `updated_at`.
- Every write appends to `history_log` with actor `"Admin"`.
- No login. No email. No live platform APIs.
- Default thresholds: bill yellow at 15 days, red at 30 days; budget orange at 90%, red at 100%.
- Unit tests never touch Neon (PGlite only). E2E only against Neon `dev` endpoint.
- Never print or log DATABASE_URL.

---

## File Structure (seams)

| File | Responsibility | Seam (interface callers depend on) |
|---|---|---|
| `src/db/assert-env.ts` | Fail loudly on wrong/missing DB target | `assertEnv(env) → { databaseUrl }` |
| `src/instrumentation.ts` | Run `assertEnv` at server boot | Next.js `register()` |
| `src/lib/month.ts` | Month/date helpers | `isMonth`, `isIsoDate`, `monthOf`, `currentMonth`, `formatMonth` |
| `src/lib/money.ts` | Amount parse/format | `parseAmount`, `formatMillion`, `formatTaka` |
| `src/lib/rules.ts` | Business rules | `Thresholds`, `DEFAULT_THRESHOLDS`, `billAgeDays`, `ageBucket`, `budgetStatus`, `costPer1000`, `prorateByMonth` |
| `src/lib/upload/templates.ts` | Template definitions per upload kind | `UploadKind`, `ColumnDef`, `TemplateDef`, `TEMPLATES`, `UPLOAD_KINDS` |
| `src/lib/upload/parse.ts` | Excel/CSV → typed rows | `parseSheet(data, kind) → ParseResult` |
| `src/lib/upload/checks.ts` | Upload checks | `checkFileType`, `fileHash`, `checkTotals`, `detectPeriods` |
| `src/lib/upload/build-template.ts` | Generate blank .xlsx | `buildTemplate(kind) → Uint8Array` |
| `src/lib/upload/merge.ts` | Manual-wins merge | `planMerge(existing, incoming)` |
| `src/db/schema.ts` | All tables & enums | Drizzle tables (names listed in Task 5) |
| `src/db/types.ts` | Shared DB type | `type Db` |
| `src/db/client.ts` | Neon connection | `getDb() → Db` |
| `src/db/test-db.ts` | PGlite test DB | `createTestDb() → Promise<Db>` |
| `src/db/seed.ts` | Reference data | `seedReferenceData(db)`, `BUSINESS_NAMES`, `CHANNELS` |
| `src/db/history.ts` | History log writer | `logChange(db, entry)` |
| `src/server/errors.ts` | Error types | `ValidationError`, `isUniqueViolation` |
| `src/server/master-data.ts` | Brands, rivals, vendors, TV stations, thresholds | functions listed in Task 6 |
| `src/components/shell/*` | Sidebar, page header | `<Sidebar/>`, `<PageHeader title subtitle/>` |
| `src/components/data/*` | Shared data UI | `<SourceTag/>`, `<EmptyState/>`, `<ActionForm/>` |
| `src/app/(modules)/**` | Routes | pages |

---

### Task 1: Workspace, Next.js scaffold and tooling

**Files:**
- Create: `D:\Dashboard Research\.gitignore`, `aci-media-dashboard/**` (scaffold), `vitest.config.ts`, `src/lib/sanity.test.ts`, `.env.example`
- Modify: `package.json` scripts

**Interfaces:**
- Consumes: nothing
- Produces: npm scripts `dev`, `build`, `test`, `test:e2e`, `db:generate`, `db:setup`; path alias `@/*` → `src/*`

- [ ] **Step 1: Init git at the workspace root**

```bash
cd "D:/Dashboard Research"
git init -b main
cat > .gitignore <<'EOF'
node_modules/
.next/
out/
.env*.local
.env
coverage/
playwright-report/
test-results/
*.log
.vercel
EOF
```

- [ ] **Step 2: Scaffold Next.js**

```bash
cd "D:/Dashboard Research"
npx create-next-app@latest aci-media-dashboard --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --disable-git --yes
```
Expected: folder `aci-media-dashboard` with `src/app/page.tsx`, `package.json`.

- [ ] **Step 3: Install runtime and dev dependencies**

```bash
cd "D:/Dashboard Research/aci-media-dashboard"
npm i drizzle-orm @neondatabase/serverless ws date-fns zod https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
npm i -D drizzle-kit @electric-sql/pglite vitest vite-tsconfig-paths @playwright/test tsx @types/ws
npx playwright install chromium
```

- [ ] **Step 4: Init shadcn/ui and add base components**

```bash
npx shadcn@latest init -d
npx shadcn@latest add button input label card badge table tabs dialog select textarea separator sonner
```
Expected: `components.json`, `src/components/ui/*.tsx`, `src/lib/utils.ts`.

- [ ] **Step 5: Add Vitest config**

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 30000,
  },
});
```

- [ ] **Step 6: Add scripts to `package.json`** (merge into existing `scripts`)

```json
"test": "vitest run",
"test:watch": "vitest",
"test:e2e": "playwright test",
"db:generate": "drizzle-kit generate",
"db:setup": "tsx src/db/setup-run.ts"
```

- [ ] **Step 7: Write the sanity test**

`src/lib/sanity.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("toolchain", () => {
  it("runs vitest with path aliases", async () => {
    const utils = await import("@/lib/utils");
    expect(typeof utils.cn).toBe("function");
  });
});
```

- [ ] **Step 8: Run tests and build**

Run: `npm test` → Expected: 1 passed.
Run: `npm run build` → Expected: build succeeds.

- [ ] **Step 9: Add `.env.example`**

```
# Neon connection string (pooled). Put the real value in .env.local only.
DATABASE_URL=
# Endpoint id of the Neon branch this app may use, e.g. ep-cool-name-123456
NEON_EXPECTED_ENDPOINT=
# Endpoint id of the Neon dev branch; e2e tests refuse to run unless it equals NEON_EXPECTED_ENDPOINT
NEON_DEV_ENDPOINT=
```

- [ ] **Step 10: Commit**

```bash
cd "D:/Dashboard Research"
git add .gitignore .spine docs aci-media-dashboard
git commit -m "chore: scaffold Next.js app with Tailwind, shadcn, Vitest, Playwright"
```

---

### Task 2: Environment assertion (boot gate)

**Files:**
- Create: `src/db/assert-env.ts`, `src/db/assert-env.test.ts`, `src/instrumentation.ts`

**Interfaces:**
- Produces: `assertEnv(env: Record<string, string | undefined>): { databaseUrl: string }` — throws `Error` with a message that never contains the password.

- [ ] **Step 1: Write the failing test**

`src/db/assert-env.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { assertEnv } from "./assert-env";

const URL_DEV = "postgresql://u:secretpw@ep-dev-123456-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";

describe("assertEnv", () => {
  it("returns the url when endpoint matches", () => {
    expect(assertEnv({ DATABASE_URL: URL_DEV, NEON_EXPECTED_ENDPOINT: "ep-dev-123456" }).databaseUrl).toBe(URL_DEV);
  });
  it("fails when DATABASE_URL is missing", () => {
    expect(() => assertEnv({ NEON_EXPECTED_ENDPOINT: "ep-dev-123456" })).toThrow(/DATABASE_URL is not set/);
  });
  it("fails when NEON_EXPECTED_ENDPOINT is missing", () => {
    expect(() => assertEnv({ DATABASE_URL: URL_DEV })).toThrow(/NEON_EXPECTED_ENDPOINT is not set/);
  });
  it("fails on a different endpoint and never leaks the password", () => {
    let msg = "";
    try {
      assertEnv({ DATABASE_URL: URL_DEV, NEON_EXPECTED_ENDPOINT: "ep-main-999999" });
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toMatch(/expected endpoint "ep-main-999999"/);
    expect(msg).not.toContain("secretpw");
  });
  it("fails on an invalid url", () => {
    expect(() => assertEnv({ DATABASE_URL: "not a url", NEON_EXPECTED_ENDPOINT: "ep-x" })).toThrow(/not a valid URL/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/db/assert-env.test.ts` → Expected: FAIL (cannot find module `./assert-env`).

- [ ] **Step 3: Implement**

`src/db/assert-env.ts`:
```ts
export function assertEnv(env: Record<string, string | undefined>): { databaseUrl: string } {
  const url = env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Add it to .env.local.");
  const expected = env.NEON_EXPECTED_ENDPOINT;
  if (!expected) throw new Error("NEON_EXPECTED_ENDPOINT is not set. Add the Neon endpoint id to .env.local.");

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("DATABASE_URL is not a valid URL.");
  }
  if (!host.startsWith(expected)) {
    const actual = host.split(".")[0];
    throw new Error(`DATABASE_URL points to "${actual}", expected endpoint "${expected}". Refusing to start.`);
  }
  return { databaseUrl: url };
}
```

`src/instrumentation.ts`:
```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertEnv } = await import("./db/assert-env");
    assertEnv(process.env);
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/db/assert-env.test.ts` → Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add aci-media-dashboard/src/db/assert-env.ts aci-media-dashboard/src/db/assert-env.test.ts aci-media-dashboard/src/instrumentation.ts
git commit -m "feat: fail loudly at boot when DATABASE_URL targets the wrong Neon endpoint"
```

---

### Task 3: Domain rules (month, money, alerts, reach cost, pro-rating)

**Files:**
- Create: `src/lib/month.ts`, `src/lib/money.ts`, `src/lib/rules.ts`, `src/lib/rules.test.ts`, `src/lib/month-money.test.ts`

**Interfaces:**
- Produces:
  - `isMonth(s: string): boolean`, `isIsoDate(s: string): boolean`, `monthOf(date: string): string`, `currentMonth(now?: Date): string`, `formatMonth(month: string): string` (e.g. `"October 2026"`)
  - `parseAmount(v: unknown): number | null` (accepts numbers and strings with commas; `""`/null → null; invalid → `NaN`), `formatMillion(taka: number): string` (`"1.23"`), `formatTaka(taka: number): string` (en-IN grouping)
  - `type Thresholds = { billYellowDays: number; billRedDays: number; budgetOrangePct: number; budgetRedPct: number }`, `DEFAULT_THRESHOLDS`
  - `billAgeDays(billDate: string, today: string, paidAt?: string | null): number | null`
  - `type AgeBucket = "fresh" | "yellow" | "red"`; `ageBucket(days: number | null, t?: Thresholds): AgeBucket | null`
  - `type BudgetLevel = "ok" | "orange" | "red" | "no-budget"`; `budgetStatus(used: number, budget: number | null | undefined, t?: Thresholds): { pct: number | null; level: BudgetLevel }`
  - `costPer1000(spend: number, reached: number | null | undefined): number | null`
  - `prorateByMonth(start: string, end: string, amount: number): Record<string, number>` — integer split by days, sums exactly to `amount`

- [ ] **Step 1: Write failing tests**

`src/lib/month-money.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { isMonth, isIsoDate, monthOf, currentMonth, formatMonth } from "./month";
import { parseAmount, formatMillion, formatTaka } from "./money";

describe("month", () => {
  it("validates months and dates", () => {
    expect(isMonth("2026-10")).toBe(true);
    expect(isMonth("2026-13")).toBe(false);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
  });
  it("derives and formats months", () => {
    expect(monthOf("2026-10-15")).toBe("2026-10");
    expect(currentMonth(new Date(Date.UTC(2026, 10, 2)))).toBe("2026-11");
    expect(formatMonth("2026-10")).toBe("October 2026");
  });
});

describe("money", () => {
  it("parses amounts", () => {
    expect(parseAmount(1200)).toBe(1200);
    expect(parseAmount("4,430,000")).toBe(4430000);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount("abc")).toBeNaN();
  });
  it("formats amounts", () => {
    expect(formatMillion(28600000)).toBe("28.60");
    expect(formatTaka(160000)).toBe("1,60,000");
  });
});
```

`src/lib/rules.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { billAgeDays, ageBucket, budgetStatus, costPer1000, prorateByMonth, DEFAULT_THRESHOLDS } from "./rules";

describe("bill aging", () => {
  it("counts days and ignores paid bills", () => {
    expect(billAgeDays("2026-10-01", "2026-10-31")).toBe(30);
    expect(billAgeDays("2026-10-01", "2026-10-31", "2026-10-20")).toBeNull();
    expect(billAgeDays("2026-11-05", "2026-11-02")).toBe(0);
  });
  it("buckets by thresholds", () => {
    expect(ageBucket(14)).toBe("fresh");
    expect(ageBucket(15)).toBe("yellow");
    expect(ageBucket(29)).toBe("yellow");
    expect(ageBucket(30)).toBe("red");
    expect(ageBucket(null)).toBeNull();
    expect(ageBucket(10, { ...DEFAULT_THRESHOLDS, billYellowDays: 7 })).toBe("yellow");
  });
});

describe("budget status", () => {
  it("colours by percent used", () => {
    expect(budgetStatus(89, 100)).toEqual({ pct: 89, level: "ok" });
    expect(budgetStatus(90, 100).level).toBe("orange");
    expect(budgetStatus(100, 100).level).toBe("red");
    expect(budgetStatus(5, 0)).toEqual({ pct: null, level: "no-budget" });
    expect(budgetStatus(5, null).level).toBe("no-budget");
  });
});

describe("cost per 1,000 reached", () => {
  it("computes and guards zero reach", () => {
    expect(costPer1000(50000, 1000000)).toBe(50);
    expect(costPer1000(50000, 0)).toBeNull();
    expect(costPer1000(50000, null)).toBeNull();
  });
});

describe("prorateByMonth", () => {
  it("keeps a single-month campaign whole", () => {
    expect(prorateByMonth("2026-10-01", "2026-10-31", 3100)).toEqual({ "2026-10": 3100 });
  });
  it("splits by days and sums exactly", () => {
    const r = prorateByMonth("2026-10-22", "2026-11-10", 1000); // 10 days Oct, 10 days Nov
    expect(r).toEqual({ "2026-10": 500, "2026-11": 500 });
    const odd = prorateByMonth("2026-10-31", "2026-11-02", 100); // 1 + 2 days
    expect(odd["2026-10"] + odd["2026-11"]).toBe(100);
    expect(odd["2026-11"]).toBe(67);
  });
  it("rejects end before start", () => {
    expect(() => prorateByMonth("2026-10-10", "2026-10-01", 1)).toThrow(/before start/);
  });
});
```

- [ ] **Step 2: Run to verify failures**

Run: `npx vitest run src/lib` → Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`src/lib/month.ts`:
```ts
const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export function isMonth(s: string): boolean {
  return MONTH_RE.test(s);
}

export function isIsoDate(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function currentMonth(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${NAMES[m - 1]} ${y}`;
}
```

`src/lib/money.ts`:
```ts
export function parseAmount(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  const s = String(v).replace(/,/g, "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export function formatMillion(taka: number): string {
  return (taka / 1_000_000).toFixed(2);
}

export function formatTaka(taka: number): string {
  return Math.round(taka).toLocaleString("en-IN");
}
```

`src/lib/rules.ts`:
```ts
export type Thresholds = {
  billYellowDays: number;
  billRedDays: number;
  budgetOrangePct: number;
  budgetRedPct: number;
};

export const DEFAULT_THRESHOLDS: Thresholds = {
  billYellowDays: 15,
  billRedDays: 30,
  budgetOrangePct: 90,
  budgetRedPct: 100,
};

const DAY = 86_400_000;

function utc(date: string): number {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function billAgeDays(billDate: string, today: string, paidAt?: string | null): number | null {
  if (paidAt) return null;
  return Math.max(0, Math.round((utc(today) - utc(billDate)) / DAY));
}

export type AgeBucket = "fresh" | "yellow" | "red";

export function ageBucket(days: number | null, t: Thresholds = DEFAULT_THRESHOLDS): AgeBucket | null {
  if (days === null) return null;
  if (days >= t.billRedDays) return "red";
  if (days >= t.billYellowDays) return "yellow";
  return "fresh";
}

export type BudgetLevel = "ok" | "orange" | "red" | "no-budget";

export function budgetStatus(
  used: number,
  budget: number | null | undefined,
  t: Thresholds = DEFAULT_THRESHOLDS,
): { pct: number | null; level: BudgetLevel } {
  if (!budget || budget <= 0) return { pct: null, level: "no-budget" };
  const pct = (used / budget) * 100;
  const level: BudgetLevel = pct >= t.budgetRedPct ? "red" : pct >= t.budgetOrangePct ? "orange" : "ok";
  return { pct, level };
}

export function costPer1000(spend: number, reached: number | null | undefined): number | null {
  if (!reached || reached <= 0) return null;
  return (spend / reached) * 1000;
}

export function prorateByMonth(start: string, end: string, amount: number): Record<string, number> {
  const s = utc(start);
  const e = utc(end);
  if (e < s) throw new Error("Campaign end date is before start date");
  const totalDays = Math.round((e - s) / DAY) + 1;
  const days: Record<string, number> = {};
  for (let t = s; t <= e; t += DAY) {
    const key = new Date(t).toISOString().slice(0, 7);
    days[key] = (days[key] ?? 0) + 1;
  }
  const out: Record<string, number> = {};
  let assigned = 0;
  const remainders = Object.keys(days).map((k) => {
    const exact = (amount * days[k]) / totalDays;
    const floor = Math.floor(exact);
    out[k] = floor;
    assigned += floor;
    return { k, r: exact - floor };
  });
  remainders.sort((a, b) => b.r - a.r || a.k.localeCompare(b.k));
  for (let i = 0; i < amount - assigned; i++) out[remainders[i].k] += 1;
  return out;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib` → Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add aci-media-dashboard/src/lib
git commit -m "feat: add month, money and business rule helpers"
```

---

### Task 4: Upload core (templates, parser, checks, template builder, merge)

**Files:**
- Create: `src/lib/upload/templates.ts`, `src/lib/upload/parse.ts`, `src/lib/upload/checks.ts`, `src/lib/upload/build-template.ts`, `src/lib/upload/merge.ts`, `src/lib/upload/upload.test.ts`

**Interfaces:**
- Consumes: `parseAmount` (money.ts), `isMonth`, `isIsoDate`, `monthOf` (month.ts)
- Produces:
  - `type UploadKind = "plan" | "spend" | "performance" | "digital" | "competitor_media" | "bills"`; `UPLOAD_KINDS: UploadKind[]`
  - `type ColumnType = "string" | "number" | "date" | "month"`; `type ColumnDef = { key: string; header: string; type: ColumnType; required: boolean }`
  - `type TemplateDef = { kind: UploadKind; title: string; fileName: string; columns: ColumnDef[]; totalKey: string | null; periodKey: string }`; `TEMPLATES: Record<UploadKind, TemplateDef>`
  - `type CellValue = string | number | null`; `type ParsedRow = { rowNumber: number; values: Record<string, CellValue> }`; `type RowError = { row: number; column: string; message: string }`; `type ParseResult = { rows: ParsedRow[]; errors: RowError[]; headerErrors: string[]; controlTotal: number | null }`
  - `parseSheet(data: Uint8Array | ArrayBuffer, kind: UploadKind): ParseResult` — a row whose first cell is `TOTAL` (any case) is not a data row; its `totalKey` cell becomes `controlTotal`
  - `checkFileType(fileName: string): boolean`; `fileHash(data: Uint8Array): string` (sha256 hex); `checkTotals(rows: ParsedRow[], key: string | null, controlTotal: number | null): { status: "no-control" | "match" | "mismatch"; rowsTotal: number; diff: number }` (diff = controlTotal − rowsTotal, match if |diff| < 1); `detectPeriods(rows: ParsedRow[], def: TemplateDef): string[]` (sorted unique `YYYY-MM`)
  - `buildTemplate(kind: UploadKind): Uint8Array` (xlsx bytes, header row only)
  - `planMerge<T extends { key: string }>(existing: { key: string; source: "upload" | "manual" }[], incoming: T[]): { toInsert: T[]; conflicts: T[] }`

- [ ] **Step 1: Write failing tests**

`src/lib/upload/upload.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { TEMPLATES, UPLOAD_KINDS } from "./templates";
import { parseSheet } from "./parse";
import { checkFileType, fileHash, checkTotals, detectPeriods } from "./checks";
import { buildTemplate } from "./build-template";
import { planMerge } from "./merge";

function workbook(rows: unknown[][]): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}

const SPEND_HEADERS = TEMPLATES.spend.columns.map((c) => c.header);

describe("templates", () => {
  it("defines every kind with a period column", () => {
    for (const k of UPLOAD_KINDS) {
      const def = TEMPLATES[k];
      expect(def.columns.some((c) => c.key === def.periodKey)).toBe(true);
    }
  });
  it("builds a template whose header row parses back cleanly", () => {
    for (const k of UPLOAD_KINDS) {
      const r = parseSheet(buildTemplate(k), k);
      expect(r.headerErrors).toEqual([]);
      expect(r.rows).toEqual([]);
    }
  });
});

describe("parseSheet", () => {
  it("parses typed rows and the TOTAL control row, ignoring header case and spacing", () => {
    const headers = SPEND_HEADERS.map((h) => `  ${h.toUpperCase()} `);
    const data = workbook([
      headers,
      ["2026-10", "2026-10-05", "Savlon Soap", "TV", "ATN News", "Agency A", "4,430,000", ""],
      ["2026-10", null, "Savlon Soap", "Digital", null, null, 1000, "boost"],
      ["TOTAL", null, null, null, null, null, 4431000, null],
    ]);
    const r = parseSheet(data, "spend");
    expect(r.headerErrors).toEqual([]);
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toEqual({
      rowNumber: 2,
      values: { month: "2026-10", entryDate: "2026-10-05", brand: "Savlon Soap", channel: "TV", tvStation: "ATN News", vendor: "Agency A", amount: 4430000, note: null },
    });
    expect(r.controlTotal).toBe(4431000);
  });

  it("reads real Excel date cells", () => {
    const ws = XLSX.utils.aoa_to_sheet([SPEND_HEADERS, ["2026-10", 46300, "B", "TV", null, null, 1, null]]);
    ws["B2"] = { t: "n", v: 46300, z: "yyyy-mm-dd" }; // 46300 = 2026-10-05
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "S");
    const r = parseSheet(new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" })), "spend");
    expect(r.rows[0].values.entryDate).toBe("2026-10-05");
  });

  it("reports missing columns", () => {
    const r = parseSheet(workbook([["Month", "Brand"]]), "spend");
    expect(r.headerErrors).toContain('Missing column "Amount (BDT, with VAT)"');
  });

  it("reports row errors with row numbers", () => {
    const r = parseSheet(workbook([SPEND_HEADERS, ["Oct", null, "", "TV", null, null, "abc", null]]), "spend");
    expect(r.errors).toEqual([
      { row: 2, column: "Month", message: "Must be a month like 2026-10" },
      { row: 2, column: "Brand", message: "Required" },
      { row: 2, column: "Amount (BDT, with VAT)", message: "Must be a number" },
    ]);
  });

  it("skips blank rows", () => {
    const r = parseSheet(workbook([SPEND_HEADERS, [], ["2026-10", null, "B", "TV", null, null, 5, null]]), "spend");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].rowNumber).toBe(3);
  });
});

describe("checks", () => {
  it("accepts only spreadsheet files", () => {
    expect(checkFileType("a.xlsx")).toBe(true);
    expect(checkFileType("A.CSV")).toBe(true);
    expect(checkFileType("a.pdf")).toBe(false);
  });
  it("hashes deterministically", () => {
    const a = new Uint8Array([1, 2, 3]);
    expect(fileHash(a)).toBe(fileHash(new Uint8Array([1, 2, 3])));
    expect(fileHash(a)).toHaveLength(64);
  });
  it("compares the control total with the row sum", () => {
    const rows = [{ rowNumber: 2, values: { amount: 34150000 } }, { rowNumber: 3, values: { amount: null } }];
    expect(checkTotals(rows, "amount", null)).toEqual({ status: "no-control", rowsTotal: 34150000, diff: 0 });
    expect(checkTotals(rows, "amount", 34150000).status).toBe("match");
    expect(checkTotals(rows, "amount", 34850000)).toEqual({ status: "mismatch", rowsTotal: 34150000, diff: 700000 });
  });
  it("detects periods from the period column", () => {
    const rows = [
      { rowNumber: 2, values: { month: "2026-10" } },
      { rowNumber: 3, values: { month: "2026-09" } },
      { rowNumber: 4, values: { month: "2026-10" } },
    ];
    expect(detectPeriods(rows, TEMPLATES.spend)).toEqual(["2026-09", "2026-10"]);
    const plan = [{ rowNumber: 2, values: { startDate: "2026-10-20" } }];
    expect(detectPeriods(plan, TEMPLATES.plan)).toEqual(["2026-10"]);
  });
});

describe("planMerge", () => {
  it("lets manual rows win and inserts the rest", () => {
    const existing = [{ key: "a", source: "manual" as const }, { key: "b", source: "upload" as const }];
    const r = planMerge(existing, [{ key: "a", v: 1 }, { key: "b", v: 2 }, { key: "c", v: 3 }]);
    expect(r.conflicts.map((x) => x.key)).toEqual(["a"]);
    expect(r.toInsert.map((x) => x.key)).toEqual(["b", "c"]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/upload` → Expected: FAIL (modules not found).

- [ ] **Step 3: Implement templates**

`src/lib/upload/templates.ts`:
```ts
export type UploadKind = "plan" | "spend" | "performance" | "digital" | "competitor_media" | "bills";
export type ColumnType = "string" | "number" | "date" | "month";
export type ColumnDef = { key: string; header: string; type: ColumnType; required: boolean };
export type TemplateDef = {
  kind: UploadKind;
  title: string;
  fileName: string;
  columns: ColumnDef[];
  totalKey: string | null;
  periodKey: string;
};

const col = (key: string, header: string, type: ColumnType, required = false): ColumnDef => ({ key, header, type, required });

export const TEMPLATES: Record<UploadKind, TemplateDef> = {
  plan: {
    kind: "plan",
    title: "Campaign plan",
    fileName: "aci-plan-template.xlsx",
    columns: [
      col("campaign", "Campaign", "string", true),
      col("brand", "Brand", "string", true),
      col("startDate", "Start date", "date", true),
      col("endDate", "End date", "date", true),
      col("status", "Status", "string"),
      col("channel", "Channel", "string", true),
      col("plannedAmount", "Planned amount (BDT, with VAT)", "number", true),
      col("notes", "Notes", "string"),
    ],
    totalKey: "plannedAmount",
    periodKey: "startDate",
  },
  spend: {
    kind: "spend",
    title: "Media spend",
    fileName: "aci-spend-template.xlsx",
    columns: [
      col("month", "Month", "month", true),
      col("entryDate", "Date", "date"),
      col("brand", "Brand", "string", true),
      col("channel", "Channel", "string", true),
      col("tvStation", "TV station", "string"),
      col("vendor", "Agency or vendor", "string"),
      col("amount", "Amount (BDT, with VAT)", "number", true),
      col("note", "Note", "string"),
    ],
    totalKey: "amount",
    periodKey: "month",
  },
  performance: {
    kind: "performance",
    title: "Channel performance",
    fileName: "aci-performance-template.xlsx",
    columns: [
      col("month", "Month", "month", true),
      col("brand", "Brand", "string", true),
      col("channel", "Channel", "string", true),
      col("spend", "Spend (BDT, with VAT)", "number", true),
      col("peopleReached", "People reached", "number"),
      col("grp", "GRP", "number"),
      col("shareOfVoice", "Share of voice %", "number"),
      col("shareOfSpend", "Share of spend %", "number"),
      col("reach1Plus", "1+ reach %", "number"),
      col("cprp", "Cost per rating point", "number"),
    ],
    totalKey: "spend",
    periodKey: "month",
  },
  digital: {
    kind: "digital",
    title: "Digital results",
    fileName: "aci-digital-template.xlsx",
    columns: [
      col("month", "Month", "month", true),
      col("brand", "Brand", "string", true),
      col("platform", "Platform", "string", true),
      col("spend", "Spend (BDT, with VAT)", "number"),
      col("reach", "Reach", "number"),
      col("impressions", "Impressions", "number"),
      col("cpm", "CPM", "number"),
      col("thruplays", "ThruPlays", "number"),
      col("costPerView", "Cost per view", "number"),
      col("engagement", "Post engagement", "number"),
    ],
    totalKey: "spend",
    periodKey: "month",
  },
  competitor_media: {
    kind: "competitor_media",
    title: "Competitor TV, Press and Radio",
    fileName: "aci-competitor-media-template.xlsx",
    columns: [
      col("month", "Month", "month", true),
      col("brand", "Brand", "string", true),
      col("subject", "Brand or rival name", "string", true),
      col("media", "Media (TV, Press, Radio)", "string", true),
      col("spend", "Spend (BDT)", "number"),
      col("spots", "Spots or insertions", "number"),
      col("shareOfVoice", "Share of voice %", "number"),
    ],
    totalKey: "spend",
    periodKey: "month",
  },
  bills: {
    kind: "bills",
    title: "Media bills",
    fileName: "aci-bills-template.xlsx",
    columns: [
      col("billNo", "Bill no", "string", true),
      col("poNo", "PO no", "string"),
      col("vendor", "Vendor", "string"),
      col("brand", "Brand", "string"),
      col("month", "Month", "month", true),
      col("billDate", "Bill date", "date", true),
      col("amount", "Amount (BDT, with VAT)", "number", true),
      col("vatAmount", "VAT amount (BDT)", "number"),
      col("status", "Status", "string"),
      col("paidOn", "Paid on", "date"),
      col("note", "Note", "string"),
    ],
    totalKey: "amount",
    periodKey: "month",
  },
};

export const UPLOAD_KINDS = Object.keys(TEMPLATES) as UploadKind[];
```

- [ ] **Step 4: Implement parser**

`src/lib/upload/parse.ts`:
```ts
import * as XLSX from "xlsx";
import { TEMPLATES, type ColumnDef, type UploadKind } from "./templates";
import { parseAmount } from "@/lib/money";
import { isIsoDate, isMonth } from "@/lib/month";

export type CellValue = string | number | null;
export type ParsedRow = { rowNumber: number; values: Record<string, CellValue> };
export type RowError = { row: number; column: string; message: string };
export type ParseResult = { rows: ParsedRow[]; errors: RowError[]; headerErrors: string[]; controlTotal: number | null };

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const pad = (n: number) => String(n).padStart(2, "0");

function serialToIso(serial: number): string | null {
  const d = XLSX.SSF.parse_date_code(serial);
  if (!d || !d.y) return null;
  return `${d.y}-${pad(d.m)}-${pad(d.d)}`;
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || String(v).trim() === "";
}

function convert(raw: unknown, c: ColumnDef): { value: CellValue; error?: string } {
  if (isEmpty(raw)) return c.required ? { value: null, error: "Required" } : { value: null };
  switch (c.type) {
    case "string":
      return { value: String(raw).trim() };
    case "number": {
      const n = parseAmount(raw);
      return n === null || Number.isNaN(n) ? { value: null, error: "Must be a number" } : { value: n };
    }
    case "date": {
      const iso = typeof raw === "number" ? serialToIso(raw) : String(raw).trim().slice(0, 10);
      return iso && isIsoDate(iso) ? { value: iso } : { value: null, error: "Must be a date like 2026-10-05" };
    }
    case "month": {
      const s = typeof raw === "number" ? (serialToIso(raw) ?? "").slice(0, 7) : String(raw).trim().slice(0, 7);
      return isMonth(s) ? { value: s } : { value: null, error: "Must be a month like 2026-10" };
    }
  }
}

export function parseSheet(data: Uint8Array | ArrayBuffer, kind: UploadKind): ParseResult {
  const def = TEMPLATES[kind];
  const wb = XLSX.read(data, { type: "array", cellDates: false, raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: true });

  const header = (grid[0] ?? []).map(norm);
  const index: Record<string, number> = {};
  const headerErrors: string[] = [];
  for (const c of def.columns) {
    const i = header.indexOf(norm(c.header));
    if (i === -1) {
      if (c.required) headerErrors.push(`Missing column "${c.header}"`);
    } else {
      index[c.key] = i;
    }
  }
  if (headerErrors.length) return { rows: [], errors: [], headerErrors, controlTotal: null };

  const rows: ParsedRow[] = [];
  const errors: RowError[] = [];
  let controlTotal: number | null = null;

  for (let r = 1; r < grid.length; r++) {
    const line = grid[r] ?? [];
    if (line.every(isEmpty)) continue;
    if (norm(line[0]) === "total") {
      if (def.totalKey && index[def.totalKey] !== undefined) {
        const n = parseAmount(line[index[def.totalKey]]);
        controlTotal = n === null || Number.isNaN(n) ? null : n;
      }
      continue;
    }
    const values: Record<string, CellValue> = {};
    for (const c of def.columns) {
      const raw = index[c.key] === undefined ? null : line[index[c.key]];
      const { value, error } = convert(raw, c);
      values[c.key] = value;
      if (error) errors.push({ row: r + 1, column: c.header, message: error });
    }
    rows.push({ rowNumber: r + 1, values });
  }
  return { rows, errors, headerErrors: [], controlTotal };
}
```

- [ ] **Step 5: Implement checks, template builder, merge**

`src/lib/upload/checks.ts`:
```ts
import { createHash } from "node:crypto";
import type { ParsedRow } from "./parse";
import type { TemplateDef } from "./templates";

const ALLOWED = [".xlsx", ".xls", ".csv"];

export function checkFileType(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return ALLOWED.some((ext) => lower.endsWith(ext));
}

export function fileHash(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export function checkTotals(
  rows: ParsedRow[],
  key: string | null,
  controlTotal: number | null,
): { status: "no-control" | "match" | "mismatch"; rowsTotal: number; diff: number } {
  const rowsTotal = key ? rows.reduce((sum, r) => sum + (typeof r.values[key] === "number" ? (r.values[key] as number) : 0), 0) : 0;
  if (controlTotal === null) return { status: "no-control", rowsTotal, diff: 0 };
  const diff = controlTotal - rowsTotal;
  return { status: Math.abs(diff) < 1 ? "match" : "mismatch", rowsTotal, diff };
}

export function detectPeriods(rows: ParsedRow[], def: TemplateDef): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    const v = r.values[def.periodKey];
    if (typeof v === "string" && v.length >= 7) set.add(v.slice(0, 7));
  }
  return [...set].sort();
}
```

`src/lib/upload/build-template.ts`:
```ts
import * as XLSX from "xlsx";
import { TEMPLATES, type UploadKind } from "./templates";

export function buildTemplate(kind: UploadKind): Uint8Array {
  const def = TEMPLATES[kind];
  const ws = XLSX.utils.aoa_to_sheet([def.columns.map((c) => c.header)]);
  ws["!cols"] = def.columns.map((c) => ({ wch: Math.max(14, c.header.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, def.title.slice(0, 31));
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}
```

`src/lib/upload/merge.ts`:
```ts
export function planMerge<T extends { key: string }>(
  existing: { key: string; source: "upload" | "manual" }[],
  incoming: T[],
): { toInsert: T[]; conflicts: T[] } {
  const manual = new Set(existing.filter((e) => e.source === "manual").map((e) => e.key));
  const toInsert: T[] = [];
  const conflicts: T[] = [];
  for (const row of incoming) (manual.has(row.key) ? conflicts : toInsert).push(row);
  return { toInsert, conflicts };
}
```

- [ ] **Step 6: Run to verify pass**

Run: `npx vitest run src/lib/upload` → Expected: all passed. If the Excel-date test fails because serial 46300 ≠ 2026-10-05, compute the correct serial with `XLSX.SSF.parse_date_code` in a REPL and fix the **test constant**, not the parser.

- [ ] **Step 7: Commit**

```bash
git add aci-media-dashboard/src/lib/upload
git commit -m "feat: add Excel upload templates, parser, checks and manual-wins merge"
```

---

### Task 5: Database schema, migrations, PGlite test harness, reference seed

**Files:**
- Create: `src/db/schema.ts`, `src/db/types.ts`, `src/db/client.ts`, `src/db/test-db.ts`, `src/db/seed.ts`, `src/db/setup-run.ts`, `src/db/schema.test.ts`, `drizzle.config.ts`, `drizzle/*` (generated)

**Interfaces:**
- Consumes: `assertEnv`, `DEFAULT_THRESHOLDS`
- Produces:
  - Tables: `uploads`, `businesses`, `brands`, `rivals`, `channels`, `tvStations`, `vendors`, `budgets`, `campaigns`, `campaignLines`, `spendEntries`, `performanceEntries`, `digitalEntries`, `competitorMedia`, `competitorAds`, `competitorYoutube`, `sourceOwners`, `bills`, `reminders`, `settings`, `historyLog`
  - Enums: `sourceEnum`, `campaignStatusEnum`, `billStatusEnum`, `uploadKindEnum`, `uploadStatusEnum`, `vendorKindEnum`, `competitorMediaEnum`, `adPlatformEnum`
  - `type Db = PgDatabase<PgQueryResultHKT, typeof schema>`
  - `getDb(): Db` (Neon); `createTestDb(): Promise<Db>` (PGlite, migrated)
  - `BUSINESS_NAMES = ["Toiletries","Hygiene","Salt","Electrolyte"]`; `CHANNELS: { code: string; name: string; parentCode: string | null }[]`; `seedReferenceData(db: Db): Promise<void>` (idempotent)

- [ ] **Step 1: Write the schema**

`src/db/schema.ts`:
```ts
import {
  pgTable, pgEnum, serial, text, integer, bigint, date, timestamp, jsonb,
  doublePrecision, boolean, uniqueIndex, index,
} from "drizzle-orm/pg-core";

export const sourceEnum = pgEnum("source", ["upload", "manual"]);
export const campaignStatusEnum = pgEnum("campaign_status", ["planned", "live", "done"]);
export const billStatusEnum = pgEnum("bill_status", [
  "unpaid", "payment_done", "cheque_in_hand", "cheque_in_counter", "finance_audit", "bill_error",
]);
export const uploadKindEnum = pgEnum("upload_kind", ["plan", "spend", "performance", "digital", "competitor_media", "bills"]);
export const uploadStatusEnum = pgEnum("upload_status", ["confirmed", "superseded", "rolled_back"]);
export const vendorKindEnum = pgEnum("vendor_kind", ["agency", "media", "other"]);
export const competitorMediaEnum = pgEnum("competitor_media_type", ["TV", "Press", "Radio"]);
export const adPlatformEnum = pgEnum("ad_platform", ["Meta", "TikTok"]);

const money = (name: string) => bigint(name, { mode: "number" });
const stamp = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });

export const uploads = pgTable("uploads", {
  id: serial("id").primaryKey(),
  kind: uploadKindEnum("kind").notNull(),
  fileName: text("file_name").notNull(),
  fileHash: text("file_hash").notNull(),
  periods: jsonb("periods").$type<string[]>().notNull(),
  rowCount: integer("row_count").notNull(),
  controlTotal: money("control_total"),
  rowsTotal: money("rows_total").notNull(),
  rows: jsonb("rows").$type<Record<string, string | number | null>[]>().notNull(),
  status: uploadStatusEnum("status").notNull().default("confirmed"),
  createdAt: stamp("created_at").notNull().defaultNow(),
}, (t) => [index("uploads_hash_idx").on(t.fileHash)]);

const tracked = () => ({
  source: sourceEnum("source").notNull().default("manual"),
  uploadId: integer("upload_id").references(() => uploads.id, { onDelete: "set null" }),
  updatedAt: stamp("updated_at").notNull().defaultNow(),
});

export const businesses = pgTable("businesses", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const brands = pgTable("brands", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  name: text("name").notNull().unique(),
  active: boolean("active").notNull().default(true),
  createdAt: stamp("created_at").notNull().defaultNow(),
});

export const rivals = pgTable("rivals", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sort: integer("sort").notNull().default(0),
}, (t) => [uniqueIndex("rivals_brand_name_uq").on(t.brandId, t.name)]);

export const channels = pgTable("channels", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  parentCode: text("parent_code"),
});

export const tvStations = pgTable("tv_stations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const vendors = pgTable("vendors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  kind: vendorKindEnum("kind").notNull().default("agency"),
});

export const budgets = pgTable("budgets", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  month: text("month").notNull(),
  amount: money("amount").notNull(),
  updatedAt: stamp("updated_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("budgets_brand_month_uq").on(t.brandId, t.month)]);

export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  status: campaignStatusEnum("status").notNull().default("planned"),
  notes: text("notes"),
  ...tracked(),
}, (t) => [index("campaigns_dates_idx").on(t.startDate, t.endDate)]);

export const campaignLines = pgTable("campaign_lines", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  channelId: integer("channel_id").notNull().references(() => channels.id),
  plannedAmount: money("planned_amount").notNull(),
});

export const spendEntries = pgTable("spend_entries", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  month: text("month").notNull(),
  entryDate: date("entry_date", { mode: "string" }),
  channelId: integer("channel_id").notNull().references(() => channels.id),
  tvStationId: integer("tv_station_id").references(() => tvStations.id),
  vendorId: integer("vendor_id").references(() => vendors.id),
  amount: money("amount").notNull(),
  note: text("note"),
  ...tracked(),
}, (t) => [index("spend_brand_month_idx").on(t.brandId, t.month)]);

export const performanceEntries = pgTable("performance_entries", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  month: text("month").notNull(),
  channelId: integer("channel_id").notNull().references(() => channels.id),
  spend: money("spend").notNull(),
  peopleReached: money("people_reached"),
  grp: doublePrecision("grp"),
  shareOfVoice: doublePrecision("share_of_voice"),
  shareOfSpend: doublePrecision("share_of_spend"),
  reach1Plus: doublePrecision("reach_1plus"),
  cprp: doublePrecision("cprp"),
  ...tracked(),
}, (t) => [uniqueIndex("perf_brand_month_channel_uq").on(t.brandId, t.month, t.channelId)]);

export const digitalEntries = pgTable("digital_entries", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  month: text("month").notNull(),
  platformId: integer("platform_id").notNull().references(() => channels.id),
  spend: money("spend"),
  reach: money("reach"),
  impressions: money("impressions"),
  cpm: doublePrecision("cpm"),
  thruplays: money("thruplays"),
  costPerView: doublePrecision("cost_per_view"),
  engagement: money("engagement"),
  ...tracked(),
}, (t) => [uniqueIndex("digital_brand_month_platform_uq").on(t.brandId, t.month, t.platformId)]);

export const competitorMedia = pgTable("competitor_media", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  month: text("month").notNull(),
  rivalId: integer("rival_id").references(() => rivals.id, { onDelete: "cascade" }),
  media: competitorMediaEnum("media").notNull(),
  spend: money("spend"),
  spots: integer("spots"),
  shareOfVoice: doublePrecision("share_of_voice"),
  ...tracked(),
});

export const competitorAds = pgTable("competitor_ads", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  rivalId: integer("rival_id").notNull().references(() => rivals.id, { onDelete: "cascade" }),
  platform: adPlatformEnum("platform").notNull(),
  adUrl: text("ad_url"),
  startedOn: date("started_on", { mode: "string" }),
  hook: text("hook"),
  cta: text("cta"),
  visualStyle: text("visual_style"),
  tone: text("tone"),
  notes: text("notes"),
  ...tracked(),
});

export const competitorYoutube = pgTable("competitor_youtube", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  month: text("month").notNull(),
  rivalId: integer("rival_id").references(() => rivals.id, { onDelete: "cascade" }),
  subscribers: money("subscribers"),
  totalViews: money("total_views"),
  videos: integer("videos"),
  latestUploadOn: date("latest_upload_on", { mode: "string" }),
  ...tracked(),
});

export const sourceOwners = pgTable("source_owners", {
  id: serial("id").primaryKey(),
  sourceKey: text("source_key").notNull().unique(),
  ownerName: text("owner_name"),
  lastUpdatedAt: stamp("last_updated_at"),
});

export const bills = pgTable("bills", {
  id: serial("id").primaryKey(),
  billNo: text("bill_no").notNull().unique(),
  poNo: text("po_no"),
  vendorId: integer("vendor_id").references(() => vendors.id),
  brandId: integer("brand_id").references(() => brands.id, { onDelete: "set null" }),
  month: text("month").notNull(),
  billDate: date("bill_date", { mode: "string" }).notNull(),
  amount: money("amount").notNull(),
  vatAmount: money("vat_amount"),
  status: billStatusEnum("status").notNull().default("unpaid"),
  paidAt: date("paid_at", { mode: "string" }),
  note: text("note"),
  ...tracked(),
});

export const reminders = pgTable("reminders", {
  id: serial("id").primaryKey(),
  billId: integer("bill_id").notNull().references(() => bills.id, { onDelete: "cascade" }),
  createdAt: stamp("created_at").notNull().defaultNow(),
  resolvedAt: stamp("resolved_at"),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});

export const historyLog = pgTable("history_log", {
  id: serial("id").primaryKey(),
  at: stamp("at").notNull().defaultNow(),
  actor: text("actor").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  reason: text("reason"),
}, (t) => [index("history_entity_idx").on(t.entity, t.entityId)]);
```

- [ ] **Step 2: Types, clients, drizzle config**

`src/db/types.ts`:
```ts
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
```

`src/db/client.ts`:
```ts
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";
import { assertEnv } from "./assert-env";
import type { Db } from "./types";

neonConfig.webSocketConstructor = ws;

let db: Db | undefined;

export function getDb(): Db {
  if (!db) {
    const { databaseUrl } = assertEnv(process.env);
    db = drizzle({ client: new Pool({ connectionString: databaseUrl }), schema }) as unknown as Db;
  }
  return db;
}
```

`src/db/test-db.ts`:
```ts
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";
import type { Db } from "./types";

export async function createTestDb(): Promise<Db> {
  const db = drizzle({ client: new PGlite(), schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  return db as unknown as Db;
}
```

`drizzle.config.ts`:
```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
```

- [ ] **Step 3: Generate the migration**

Run: `npm run db:generate` → Expected: `drizzle/0000_*.sql` and `drizzle/meta/*` created.

- [ ] **Step 4: Write the failing seed/schema test**

`src/db/schema.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createTestDb } from "./test-db";
import { seedReferenceData, BUSINESS_NAMES, CHANNELS } from "./seed";
import { businesses, channels, settings } from "./schema";
import { DEFAULT_THRESHOLDS } from "@/lib/rules";

describe("schema + seed", () => {
  it("migrates and seeds reference data idempotently", async () => {
    const db = await createTestDb();
    await seedReferenceData(db);
    await seedReferenceData(db);
    const b = await db.select().from(businesses);
    expect(b.map((x) => x.name).sort()).toEqual([...BUSINESS_NAMES].sort());
    const c = await db.select().from(channels);
    expect(c).toHaveLength(CHANNELS.length);
    const s = await db.select().from(settings);
    expect(s).toEqual([{ key: "thresholds", value: DEFAULT_THRESHOLDS }]);
  });
});
```

- [ ] **Step 5: Run to verify failure**

Run: `npx vitest run src/db/schema.test.ts` → Expected: FAIL (cannot find `./seed`).

- [ ] **Step 6: Implement seed and setup runner**

`src/db/seed.ts`:
```ts
import { businesses, channels, settings } from "./schema";
import type { Db } from "./types";
import { DEFAULT_THRESHOLDS } from "@/lib/rules";

export const BUSINESS_NAMES = ["Toiletries", "Hygiene", "Salt", "Electrolyte"] as const;

export const CHANNELS: { code: string; name: string; parentCode: string | null }[] = [
  { code: "TV", name: "TV", parentCode: null },
  { code: "PRESS", name: "Press", parentCode: null },
  { code: "RADIO", name: "Radio", parentCode: null },
  { code: "OOH", name: "OOH", parentCode: null },
  { code: "DIGITAL", name: "Digital", parentCode: null },
  { code: "META", name: "Meta", parentCode: "DIGITAL" },
  { code: "YOUTUBE", name: "YouTube", parentCode: "DIGITAL" },
  { code: "TIKTOK", name: "TikTok", parentCode: "DIGITAL" },
];

export async function seedReferenceData(db: Db): Promise<void> {
  await db.insert(businesses).values(BUSINESS_NAMES.map((name) => ({ name }))).onConflictDoNothing();
  await db.insert(channels).values(CHANNELS).onConflictDoNothing();
  await db.insert(settings).values({ key: "thresholds", value: DEFAULT_THRESHOLDS }).onConflictDoNothing();
}
```

`src/db/setup-run.ts` (applies migrations + seed to Neon; asserts env first):
```ts
import { loadEnvConfig } from "@next/env";
import { migrate } from "drizzle-orm/neon-serverless/migrator";

loadEnvConfig(process.cwd());

async function main() {
  const { getDb } = await import("./client");
  const { seedReferenceData } = await import("./seed");
  const db = getDb();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await migrate(db as any, { migrationsFolder: "drizzle" });
  await seedReferenceData(db);
  console.log("Database migrated and reference data seeded.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
```

- [ ] **Step 7: Run to verify pass**

Run: `npx vitest run src/db` → Expected: all passed.

- [ ] **Step 8: Commit**

```bash
git add aci-media-dashboard/src/db aci-media-dashboard/drizzle aci-media-dashboard/drizzle.config.ts
git commit -m "feat: add Drizzle schema, migrations, PGlite test harness and reference seed"
```

---

### Task 6: History log + master-data services

**Files:**
- Create: `src/db/history.ts`, `src/server/errors.ts`, `src/server/master-data.ts`, `src/server/master-data.test.ts`

**Interfaces:**
- Consumes: `Db`, tables from Task 5, `Thresholds`, `DEFAULT_THRESHOLDS`
- Produces:
  - `type HistoryEntry = { entity: string; entityId: string | number; action: "create" | "update" | "delete" | "upload" | "restore"; before?: unknown; after?: unknown; reason?: string }`; `logChange(db: Db, e: HistoryEntry): Promise<void>`
  - `class ValidationError extends Error`; `isUniqueViolation(e: unknown): boolean`
  - `listBusinesses(db)`, `listBrandsWithRivals(db): Promise<{ id; name; businessId; businessName; active; rivals: { id; name }[] }[]>`
  - `createBrand(db, { name: string; businessId: number })`, `renameBrand(db, id: number, name: string)`, `setBrandActive(db, id: number, active: boolean)`
  - `addRival(db, { brandId: number; name: string })` (max 3), `removeRival(db, id: number)`
  - `listVendors(db)`, `createVendor(db, { name: string; kind: "agency" | "media" | "other" })`
  - `listTvStations(db)`, `createTvStation(db, name: string)`
  - `getThresholds(db): Promise<Thresholds>`, `setThresholds(db, t: Thresholds)`

- [ ] **Step 1: Write failing tests**

`src/server/master-data.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { seedReferenceData } from "@/db/seed";
import type { Db } from "@/db/types";
import { historyLog } from "@/db/schema";
import { ValidationError } from "./errors";
import {
  listBusinesses, listBrandsWithRivals, createBrand, renameBrand, addRival, removeRival,
  createVendor, listVendors, createTvStation, listTvStations, getThresholds, setThresholds,
} from "./master-data";
import { DEFAULT_THRESHOLDS } from "@/lib/rules";

let db: Db;
let toiletriesId: number;

beforeEach(async () => {
  db = await createTestDb();
  await seedReferenceData(db);
  toiletriesId = (await listBusinesses(db)).find((b) => b.name === "Toiletries")!.id;
});

describe("brands", () => {
  it("creates, lists and logs", async () => {
    const b = await createBrand(db, { name: "  Savlon Soap ", businessId: toiletriesId });
    expect(b.name).toBe("Savlon Soap");
    const list = await listBrandsWithRivals(db);
    expect(list).toEqual([{ id: b.id, name: "Savlon Soap", businessId: toiletriesId, businessName: "Toiletries", active: true, rivals: [] }]);
    const log = await db.select().from(historyLog);
    expect(log[0]).toMatchObject({ actor: "Admin", entity: "brand", entityId: String(b.id), action: "create" });
  });
  it("rejects empty and duplicate names", async () => {
    await expect(createBrand(db, { name: " ", businessId: toiletriesId })).rejects.toThrow(ValidationError);
    await createBrand(db, { name: "Savlon Soap", businessId: toiletriesId });
    await expect(createBrand(db, { name: "Savlon Soap", businessId: toiletriesId })).rejects.toThrow(/already exists/);
  });
  it("renames", async () => {
    const b = await createBrand(db, { name: "Savlon", businessId: toiletriesId });
    await renameBrand(db, b.id, "Savlon Soap");
    expect((await listBrandsWithRivals(db))[0].name).toBe("Savlon Soap");
  });
});

describe("rivals", () => {
  it("allows at most 3 per brand", async () => {
    const b = await createBrand(db, { name: "Savlon Soap", businessId: toiletriesId });
    for (const n of ["Lifebuoy", "Dettol", "Lux"]) await addRival(db, { brandId: b.id, name: n });
    await expect(addRival(db, { brandId: b.id, name: "Sandalina" })).rejects.toThrow(/at most 3 rivals/);
    const rivals = (await listBrandsWithRivals(db))[0].rivals;
    expect(rivals.map((r) => r.name)).toEqual(["Lifebuoy", "Dettol", "Lux"]);
    await removeRival(db, rivals[0].id);
    await addRival(db, { brandId: b.id, name: "Sandalina" });
    expect((await listBrandsWithRivals(db))[0].rivals).toHaveLength(3);
  });
});

describe("vendors and tv stations", () => {
  it("creates and lists sorted", async () => {
    await createVendor(db, { name: "Mindshare", kind: "agency" });
    await createVendor(db, { name: "Asiatic", kind: "agency" });
    expect((await listVendors(db)).map((v) => v.name)).toEqual(["Asiatic", "Mindshare"]);
    await createTvStation(db, "ATN News");
    expect((await listTvStations(db)).map((t) => t.name)).toEqual(["ATN News"]);
    await expect(createTvStation(db, "ATN News")).rejects.toThrow(/already exists/);
  });
});

describe("thresholds", () => {
  it("reads defaults and validates updates", async () => {
    expect(await getThresholds(db)).toEqual(DEFAULT_THRESHOLDS);
    await setThresholds(db, { billYellowDays: 10, billRedDays: 20, budgetOrangePct: 80, budgetRedPct: 100 });
    expect((await getThresholds(db)).billYellowDays).toBe(10);
    await expect(setThresholds(db, { ...DEFAULT_THRESHOLDS, billYellowDays: 30, billRedDays: 15 })).rejects.toThrow(ValidationError);
    await expect(setThresholds(db, { ...DEFAULT_THRESHOLDS, budgetOrangePct: 110 })).rejects.toThrow(ValidationError);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/server` → Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`src/db/history.ts`:
```ts
import { historyLog } from "./schema";
import type { Db } from "./types";

export type HistoryEntry = {
  entity: string;
  entityId: string | number;
  action: "create" | "update" | "delete" | "upload" | "restore";
  before?: unknown;
  after?: unknown;
  reason?: string;
};

export async function logChange(db: Db, e: HistoryEntry): Promise<void> {
  await db.insert(historyLog).values({
    actor: "Admin",
    entity: e.entity,
    entityId: String(e.entityId),
    action: e.action,
    before: e.before ?? null,
    after: e.after ?? null,
    reason: e.reason ?? null,
  });
}
```

`src/server/errors.ts`:
```ts
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } } | null;
  return err?.code === "23505" || err?.cause?.code === "23505";
}
```

`src/server/master-data.ts`:
```ts
import { asc, eq, count } from "drizzle-orm";
import { brands, businesses, rivals, vendors, tvStations, settings } from "@/db/schema";
import type { Db } from "@/db/types";
import { logChange } from "@/db/history";
import { DEFAULT_THRESHOLDS, type Thresholds } from "@/lib/rules";
import { ValidationError, isUniqueViolation } from "./errors";

const MAX_RIVALS = 3;

function cleanName(name: string, label: string): string {
  const n = name.trim().replace(/\s+/g, " ");
  if (!n) throw new ValidationError(`${label} name is required`);
  return n;
}

async function insertUnique<T>(label: string, name: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (isUniqueViolation(e)) throw new ValidationError(`${label} "${name}" already exists`);
    throw e;
  }
}

export async function listBusinesses(db: Db) {
  return db.select().from(businesses).orderBy(asc(businesses.name));
}

export async function listBrandsWithRivals(db: Db) {
  const rows = await db
    .select({ id: brands.id, name: brands.name, businessId: brands.businessId, businessName: businesses.name, active: brands.active })
    .from(brands)
    .innerJoin(businesses, eq(brands.businessId, businesses.id))
    .orderBy(asc(businesses.name), asc(brands.name));
  const allRivals = await db.select().from(rivals).orderBy(asc(rivals.sort), asc(rivals.id));
  return rows.map((b) => ({
    ...b,
    rivals: allRivals.filter((r) => r.brandId === b.id).map((r) => ({ id: r.id, name: r.name })),
  }));
}

export async function createBrand(db: Db, input: { name: string; businessId: number }) {
  const name = cleanName(input.name, "Brand");
  const [row] = await insertUnique("Brand", name, () =>
    db.insert(brands).values({ name, businessId: input.businessId }).returning(),
  );
  await logChange(db, { entity: "brand", entityId: row.id, action: "create", after: row });
  return row;
}

export async function renameBrand(db: Db, id: number, newName: string) {
  const name = cleanName(newName, "Brand");
  const [before] = await db.select().from(brands).where(eq(brands.id, id));
  if (!before) throw new ValidationError("Brand not found");
  const [row] = await insertUnique("Brand", name, () =>
    db.update(brands).set({ name }).where(eq(brands.id, id)).returning(),
  );
  await logChange(db, { entity: "brand", entityId: id, action: "update", before, after: row });
  return row;
}

export async function setBrandActive(db: Db, id: number, active: boolean) {
  const [before] = await db.select().from(brands).where(eq(brands.id, id));
  if (!before) throw new ValidationError("Brand not found");
  const [row] = await db.update(brands).set({ active }).where(eq(brands.id, id)).returning();
  await logChange(db, { entity: "brand", entityId: id, action: "update", before, after: row });
  return row;
}

export async function addRival(db: Db, input: { brandId: number; name: string }) {
  const name = cleanName(input.name, "Rival");
  const [{ n }] = await db.select({ n: count() }).from(rivals).where(eq(rivals.brandId, input.brandId));
  if (n >= MAX_RIVALS) throw new ValidationError(`A brand can have at most ${MAX_RIVALS} rivals`);
  const [row] = await insertUnique("Rival", name, () =>
    db.insert(rivals).values({ brandId: input.brandId, name, sort: n }).returning(),
  );
  await logChange(db, { entity: "rival", entityId: row.id, action: "create", after: row });
  return row;
}

export async function removeRival(db: Db, id: number) {
  const [before] = await db.delete(rivals).where(eq(rivals.id, id)).returning();
  if (!before) throw new ValidationError("Rival not found");
  await logChange(db, { entity: "rival", entityId: id, action: "delete", before });
}

export async function listVendors(db: Db) {
  return db.select().from(vendors).orderBy(asc(vendors.name));
}

export async function createVendor(db: Db, input: { name: string; kind: "agency" | "media" | "other" }) {
  const name = cleanName(input.name, "Vendor");
  const [row] = await insertUnique("Vendor", name, () => db.insert(vendors).values({ name, kind: input.kind }).returning());
  await logChange(db, { entity: "vendor", entityId: row.id, action: "create", after: row });
  return row;
}

export async function listTvStations(db: Db) {
  return db.select().from(tvStations).orderBy(asc(tvStations.name));
}

export async function createTvStation(db: Db, rawName: string) {
  const name = cleanName(rawName, "TV station");
  const [row] = await insertUnique("TV station", name, () => db.insert(tvStations).values({ name }).returning());
  await logChange(db, { entity: "tv_station", entityId: row.id, action: "create", after: row });
  return row;
}

export async function getThresholds(db: Db): Promise<Thresholds> {
  const [row] = await db.select().from(settings).where(eq(settings.key, "thresholds"));
  return { ...DEFAULT_THRESHOLDS, ...((row?.value as Partial<Thresholds>) ?? {}) };
}

export async function setThresholds(db: Db, t: Thresholds) {
  const ints = [t.billYellowDays, t.billRedDays, t.budgetOrangePct, t.budgetRedPct];
  if (ints.some((v) => !Number.isInteger(v) || v <= 0)) throw new ValidationError("Thresholds must be whole numbers above 0");
  if (t.billYellowDays >= t.billRedDays) throw new ValidationError("Bill yellow days must be less than red days");
  if (t.budgetOrangePct >= t.budgetRedPct) throw new ValidationError("Budget orange % must be less than red %");
  if (t.budgetRedPct > 100) throw new ValidationError("Budget red % cannot be above 100");
  const before = await getThresholds(db);
  await db.insert(settings).values({ key: "thresholds", value: t }).onConflictDoUpdate({ target: settings.key, set: { value: t } });
  await logChange(db, { entity: "settings", entityId: "thresholds", action: "update", before, after: t });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/server` → Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add aci-media-dashboard/src/db/history.ts aci-media-dashboard/src/server
git commit -m "feat: add history log and master data services"
```

---

### Task 7: App shell, shared data components, Settings page, e2e smoke

**Files:**
- Delete: `src/app/page.tsx`
- Modify: `src/app/layout.tsx`, `src/app/globals.css` (append tokens)
- Create: `src/components/shell/sidebar.tsx`, `src/components/shell/page-header.tsx`, `src/components/data/source-tag.tsx`, `src/components/data/empty-state.tsx`, `src/components/data/action-form.tsx`, `src/app/(modules)/page.tsx`, `src/app/(modules)/{plan,spend,performance,digital,competitors,billing,uploads}/page.tsx`, `src/app/(modules)/settings/page.tsx`, `src/app/(modules)/settings/actions.ts`, `src/app/api/templates/[kind]/route.ts`, `playwright.config.ts`, `e2e/global-setup.ts`, `e2e/settings.spec.ts`

**Interfaces:**
- Consumes: master-data services, `getDb`, `TEMPLATES`, `UPLOAD_KINDS`, `buildTemplate`, `ValidationError`
- Produces:
  - `NAV_ITEMS: { href: string; label: string }[]` (exported from sidebar.tsx)
  - `<PageHeader title: string; subtitle?: string; children?: ReactNode />`
  - `<SourceTag source: "upload" | "manual" | "mixed" | null; updatedAt: string | null; label?: string />`
  - `<EmptyState title: string; message: string; children?: ReactNode />`
  - `type ActionState = { error: string | null; ok?: boolean }`; `<ActionForm action: (prev: ActionState, fd: FormData) => Promise<ActionState>; className?: string; resetOnSuccess?: boolean>`
  - `GET /api/templates/[kind]` → xlsx download
  - `toActionError(e: unknown): ActionState` in `settings/actions.ts` pattern (re-exported from `src/server/action-state.ts`)

- [ ] **Step 1: Shared components**

`src/server/action-state.ts`:
```ts
import { ValidationError } from "./errors";

export type ActionState = { error: string | null; ok?: boolean };

export function toActionError(e: unknown): ActionState {
  if (e instanceof ValidationError) return { error: e.message };
  console.error(e);
  return { error: "Something went wrong. Please try again." };
}
```

`src/components/data/action-form.tsx`:
```tsx
"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import type { ActionState } from "@/server/action-state";

export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = true,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className} aria-busy={pending}>
      {children}
      {state.error && (
        <p role="alert" className="w-full text-sm text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
```

`src/components/data/source-tag.tsx`:
```tsx
const LABEL = { upload: "Uploaded", manual: "Manual entry", mixed: "Uploaded and manual edit" } as const;

export function SourceTag({
  source,
  updatedAt,
  label,
}: {
  source: "upload" | "manual" | "mixed" | null;
  updatedAt: string | null;
  label?: string;
}) {
  const when = updatedAt
    ? new Date(updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "never";
  return (
    <p className="text-xs text-stone-500">
      {label ? `${label} · ` : "Source: "}
      {source ? LABEL[source] : "No data yet"} · Updated {when}
    </p>
  );
}
```

`src/components/data/empty-state.tsx`:
```tsx
import type { ReactNode } from "react";

export function EmptyState({ title, message, children }: { title: string; message: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-stone-300 bg-white px-6 py-12 text-center">
      <p className="font-medium text-stone-800">{title}</p>
      <p className="max-w-md text-sm text-stone-500">{message}</p>
      {children && <div className="mt-3 flex gap-2">{children}</div>}
    </div>
  );
}
```

`src/components/shell/page-header.tsx`:
```tsx
import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">{title}</h1>
        {subtitle && <p className="text-sm text-stone-500">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}
```

`src/components/shell/sidebar.tsx`:
```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/plan", label: "Plan" },
  { href: "/spend", label: "Spend" },
  { href: "/performance", label: "Performance" },
  { href: "/digital", label: "Digital Data" },
  { href: "/competitors", label: "Competitor Tracking" },
  { href: "/billing", label: "Billing" },
  { href: "/uploads", label: "Uploads & History" },
  { href: "/settings", label: "Settings" },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-1 p-4">
      <div className="mb-6 px-2">
        <p className="text-lg font-semibold text-stone-900">ACI Media</p>
        <p className="text-xs text-stone-500">Consumer Brands dashboard</p>
      </div>
      {NAV_ITEMS.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-2 text-sm text-stone-700 hover:bg-stone-200/60",
              active && "bg-stone-900 text-white hover:bg-stone-900",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Layout and placeholder pages**

`src/app/layout.tsx` (replace file):
```tsx
import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import { Sidebar } from "@/components/shell/sidebar";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });

export const metadata: Metadata = {
  title: "ACI Media Dashboard",
  description: "Plan, spend, performance, digital, competitors and billing in one place",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} font-sans antialiased bg-[#f5f4ef] text-stone-900`}>
        <div className="flex min-h-screen flex-col md:flex-row">
          <aside className="border-b border-stone-200 bg-[#faf9f5] md:w-60 md:shrink-0 md:border-b-0 md:border-r">
            <Sidebar />
          </aside>
          <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
        </div>
        <Toaster />
      </body>
    </html>
  );
}
```

Append to `src/app/globals.css`:
```css
@theme inline {
  --font-sans: var(--font-dm-sans), system-ui, sans-serif;
}
```

Delete `src/app/page.tsx`. Create placeholder pages — one file per route, each exactly this shape with its own title (Home → "Home", plan → "Plan", spend → "Spend", performance → "Performance", digital → "Digital Data", competitors → "Competitor Tracking", billing → "Billing", uploads → "Uploads & History"). Example `src/app/(modules)/plan/page.tsx`:
```tsx
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/data/empty-state";

export default function Page() {
  return (
    <>
      <PageHeader title="Plan" subtitle="Costs with VAT" />
      <EmptyState title="Not built yet" message="This module is added in a later build plan." />
    </>
  );
}
```

- [ ] **Step 3: Template download route**

`src/app/api/templates/[kind]/route.ts`:
```ts
import { TEMPLATES, UPLOAD_KINDS, type UploadKind } from "@/lib/upload/templates";
import { buildTemplate } from "@/lib/upload/build-template";

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!UPLOAD_KINDS.includes(kind as UploadKind)) return new Response("Unknown template", { status: 404 });
  const def = TEMPLATES[kind as UploadKind];
  return new Response(Buffer.from(buildTemplate(def.kind)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${def.fileName}"`,
    },
  });
}
```

- [ ] **Step 4: Settings server actions**

`src/app/(modules)/settings/actions.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { addRival, createBrand, createTvStation, createVendor, removeRival, setThresholds } from "@/server/master-data";
import { toActionError, type ActionState } from "@/server/action-state";

const done = (): ActionState => {
  revalidatePath("/settings");
  return { error: null, ok: true };
};

export async function createBrandAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await createBrand(getDb(), { name: String(fd.get("name") ?? ""), businessId: Number(fd.get("businessId")) });
    return done();
  } catch (e) {
    return toActionError(e);
  }
}

export async function addRivalAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await addRival(getDb(), { brandId: Number(fd.get("brandId")), name: String(fd.get("name") ?? "") });
    return done();
  } catch (e) {
    return toActionError(e);
  }
}

export async function removeRivalAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await removeRival(getDb(), Number(fd.get("id")));
    return done();
  } catch (e) {
    return toActionError(e);
  }
}

export async function createVendorAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const kind = String(fd.get("kind")) as "agency" | "media" | "other";
    await createVendor(getDb(), { name: String(fd.get("name") ?? ""), kind });
    return done();
  } catch (e) {
    return toActionError(e);
  }
}

export async function createTvStationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await createTvStation(getDb(), String(fd.get("name") ?? ""));
    return done();
  } catch (e) {
    return toActionError(e);
  }
}

export async function setThresholdsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await setThresholds(getDb(), {
      billYellowDays: Number(fd.get("billYellowDays")),
      billRedDays: Number(fd.get("billRedDays")),
      budgetOrangePct: Number(fd.get("budgetOrangePct")),
      budgetRedPct: Number(fd.get("budgetRedPct")),
    });
    return done();
  } catch (e) {
    return toActionError(e);
  }
}
```

- [ ] **Step 5: Settings page**

`src/app/(modules)/settings/page.tsx`:
```tsx
import { getDb } from "@/db/client";
import { PageHeader } from "@/components/shell/page-header";
import { ActionForm } from "@/components/data/action-form";
import { EmptyState } from "@/components/data/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getThresholds, listBrandsWithRivals, listBusinesses, listTvStations, listVendors } from "@/server/master-data";
import { TEMPLATES, UPLOAD_KINDS } from "@/lib/upload/templates";
import {
  addRivalAction, createBrandAction, createTvStationAction, createVendorAction, removeRivalAction, setThresholdsAction,
} from "./actions";

export const dynamic = "force-dynamic";

const selectClass = "h-9 rounded-md border border-stone-300 bg-white px-2 text-sm";

export default async function SettingsPage() {
  const db = getDb();
  const [businesses, brands, vendors, stations, thresholds] = await Promise.all([
    listBusinesses(db), listBrandsWithRivals(db), listVendors(db), listTvStations(db), getThresholds(db),
  ]);

  return (
    <>
      <PageHeader title="Settings" subtitle="Brands, rivals, vendors, TV stations, alert rules and templates" />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Brands and rivals</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <ActionForm action={createBrandAction} className="flex flex-wrap gap-2">
              <Input name="name" placeholder="Brand name" aria-label="Brand name" className="w-56" required />
              <select name="businessId" aria-label="Business" className={selectClass} required>
                {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <Button type="submit">Add brand</Button>
            </ActionForm>
            {brands.length === 0 ? (
              <EmptyState title="No brands yet" message="Add ACI's brands above. Each brand can track up to 3 rivals." />
            ) : (
              <ul className="divide-y divide-stone-200">
                {brands.map((b) => (
                  <li key={b.id} className="py-3" data-testid={`brand-${b.name}`}>
                    <p className="font-medium">{b.name} <span className="text-xs text-stone-500">· {b.businessName}</span></p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {b.rivals.map((r) => (
                        <ActionForm key={r.id} action={removeRivalAction} className="inline-flex">
                          <input type="hidden" name="id" value={r.id} />
                          <span className="rounded-full bg-stone-100 px-3 py-1 text-xs">
                            {r.name}{" "}
                            <button type="submit" aria-label={`Remove rival ${r.name}`} className="ml-1 text-stone-500 hover:text-red-700">×</button>
                          </span>
                        </ActionForm>
                      ))}
                      {b.rivals.length < 3 && (
                        <ActionForm action={addRivalAction} className="flex gap-2">
                          <input type="hidden" name="brandId" value={b.id} />
                          <Input name="name" placeholder="Rival name" aria-label={`Rival for ${b.name}`} className="h-8 w-40" required />
                          <Button type="submit" size="sm" variant="outline">Add rival</Button>
                        </ActionForm>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Alert rules</CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={setThresholdsAction} className="grid grid-cols-2 gap-3" resetOnSuccess={false}>
              {([
                ["billYellowDays", "Bill turns yellow after (days)"],
                ["billRedDays", "Bill turns red after (days)"],
                ["budgetOrangePct", "Budget turns orange at (%)"],
                ["budgetRedPct", "Budget turns red at (%)"],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex flex-col gap-1 text-sm">
                  {label}
                  <Input name={key} type="number" min={1} defaultValue={thresholds[key]} required />
                </label>
              ))}
              <Button type="submit" className="col-span-2 w-fit">Save alert rules</Button>
            </ActionForm>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Agencies and vendors</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <ActionForm action={createVendorAction} className="flex flex-wrap gap-2">
              <Input name="name" placeholder="Vendor name" aria-label="Vendor name" className="w-56" required />
              <select name="kind" aria-label="Vendor type" className={selectClass}>
                <option value="agency">Agency</option>
                <option value="media">Media owner</option>
                <option value="other">Other</option>
              </select>
              <Button type="submit">Add vendor</Button>
            </ActionForm>
            <p className="text-sm text-stone-600">{vendors.length ? vendors.map((v) => v.name).join(", ") : "No vendors yet."}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>TV stations</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <ActionForm action={createTvStationAction} className="flex gap-2">
              <Input name="name" placeholder="TV station" aria-label="TV station name" className="w-56" required />
              <Button type="submit">Add station</Button>
            </ActionForm>
            <p className="text-sm text-stone-600">{stations.length ? stations.map((s) => s.name).join(", ") : "No TV stations yet."}</p>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Excel templates</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {UPLOAD_KINDS.map((k) => (
              <Button key={k} variant="outline" asChild>
                <a href={`/api/templates/${k}`} download>{TEMPLATES[k].title}</a>
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
```
Note: if the installed shadcn `Button` has no `asChild` prop (newer shadcn on Base UI uses `render`), use a plain `<a>` with `buttonVariants({ variant: "outline" })` class from `@/components/ui/button` instead.

- [ ] **Step 6: Build check**

Run: `npm run build` → Expected: success. (Settings is `force-dynamic`, so build does not need the DB.) Run `npm test` → all unit tests still pass. Run `npx eslint src` → no errors.

- [ ] **Step 7: Commit shell**

```bash
git add aci-media-dashboard
git commit -m "feat: add app shell, shared data components, settings page and template downloads"
```

- [ ] **Step 8: Playwright config and smoke test** (needs Neon dev — **BLOCKED until `.env.local` exists and Gate C is closed**)

`playwright.config.ts`:
```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: "http://localhost:3000" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true, timeout: 120000 },
});
```

`e2e/global-setup.ts`:
```ts
import { loadEnvConfig } from "@next/env";
import { assertEnv } from "../src/db/assert-env";

export default function globalSetup() {
  loadEnvConfig(process.cwd());
  assertEnv(process.env);
  if (!process.env.NEON_DEV_ENDPOINT || process.env.NEON_EXPECTED_ENDPOINT !== process.env.NEON_DEV_ENDPOINT) {
    throw new Error("E2E tests only run against the Neon dev branch. Set NEON_EXPECTED_ENDPOINT to NEON_DEV_ENDPOINT.");
  }
}
```

`e2e/settings.spec.ts`:
```ts
import { test, expect } from "@playwright/test";
import { NAV_ITEMS } from "../src/components/shell/sidebar";

test("sidebar shows all sections", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  for (const item of NAV_ITEMS) await expect(nav.getByRole("link", { name: item.label, exact: true })).toBeVisible();
});

test("add a brand and a rival in settings", async ({ page }) => {
  const brand = `E2E Brand ${Date.now()}`;
  await page.goto("/settings");
  await page.getByLabel("Brand name").fill(brand);
  await page.getByLabel("Business").selectOption({ label: "Hygiene" });
  await page.getByRole("button", { name: "Add brand" }).click();
  const row = page.getByTestId(`brand-${brand}`);
  await expect(row).toBeVisible();
  await row.getByLabel(`Rival for ${brand}`).fill("Rival One");
  await row.getByRole("button", { name: "Add rival" }).click();
  await expect(row.getByText("Rival One")).toBeVisible();
});

test("template download returns an xlsx", async ({ request }) => {
  const res = await request.get("/api/templates/spend");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-disposition"]).toContain("aci-spend-template.xlsx");
});
```
Note: importing `NAV_ITEMS` from a `"use client"` file into Playwright is fine (plain TS export); if Playwright's transpiler rejects the JSX import, inline the 9 labels in the spec instead.

- [ ] **Step 9: Set up Neon dev DB and run e2e**

Run: `npm run db:setup` → Expected: "Database migrated and reference data seeded."
Run: `npm run test:e2e` → Expected: 3 passed.

- [ ] **Step 10: Commit**

```bash
git add aci-media-dashboard/playwright.config.ts aci-media-dashboard/e2e
git commit -m "test: add Playwright smoke tests for shell and settings"
```

---

## Self-review notes

- Spec coverage for this plan: stack/config (T1–2), global rules money/month/thresholds (T3), upload pipeline checks 1–3 and manual-wins (T4), full data model (T5), history log + master data + Settings (T6–7), shell + SourceTag + EmptyState (T7), templates download (T7). Upload confirm/save/restore UI, all six module pages, Home, export and deploy are in Plans 2–7 by design.
- Spec deviation recorded: superseded upload rows are deleted and recoverable from `uploads.rows` snapshot (restore re-applies the snapshot) rather than soft-flagged per row. Same user-visible behaviour, simpler schema.
