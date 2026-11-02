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
