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
  const rowsTotal = key
    ? rows.reduce((sum, r) => sum + (typeof r.values[key] === "number" ? (r.values[key] as number) : 0), 0)
    : 0;
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
