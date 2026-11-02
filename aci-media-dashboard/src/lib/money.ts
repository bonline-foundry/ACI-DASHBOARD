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
