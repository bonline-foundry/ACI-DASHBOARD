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
