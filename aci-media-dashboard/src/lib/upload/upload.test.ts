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
