import { and, eq, isNotNull, lte, sql } from "drizzle-orm";
import { performanceEntries, uploads } from "@/db/schema";
import type { Db } from "@/db/types";
import { addDays, formatMonth } from "@/lib/month";
import { formatTaka } from "@/lib/money";
import { billSummary, listOpenReminders } from "./billing";
import { listSources } from "./competitors";
import { getThresholds } from "./master-data";
import { reachCost } from "./performance";
import { listCampaigns, planVsBudget } from "./plan";

export const UPCOMING_DAYS = 14;
const UPLOAD_REVIEW_DAYS = 30;

export type Alert = { level: "red" | "orange"; text: string; href: string };

async function latestReachMonth(db: Db, upTo: string): Promise<string | null> {
  const [r] = await db.select({ m: sql<string | null>`max(${performanceEntries.month})` }).from(performanceEntries)
    .where(and(lte(performanceEntries.month, upTo), isNotNull(performanceEntries.peopleReached)));
  return r?.m ?? null;
}

const dayDiff = (from: string, to: string) =>
  Math.round((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / 86_400_000);

export async function homeData(db: Db, q: { today: string; month: string }) {
  const until = addDays(q.today, UPCOMING_DAYS);
  const [t, budgets, bills, reminders, campaigns, reachMonth, recentUploads, sources] = await Promise.all([
    getThresholds(db),
    planVsBudget(db, q.month),
    billSummary(db, q.today),
    listOpenReminders(db, q.today),
    listCampaigns(db, { from: q.today, to: until }),
    latestReachMonth(db, q.month),
    db.select().from(uploads).where(eq(uploads.status, "confirmed")),
    listSources(db, q.today),
  ]);

  let bestReach = null;
  if (reachMonth) {
    const row = (await reachCost(db, { month: reachMonth })).find((r) => r.costPer1000 !== null);
    if (row) bestReach = { month: reachMonth, row };
  }

  const alerts: Alert[] = [];
  if (bills.red.count) {
    alerts.push({
      level: "red", href: "/billing?age=red",
      text: `${bills.red.count} ${bills.red.count === 1 ? "bill" : "bills"} waiting ${t.billRedDays}+ days (${formatTaka(bills.red.amount)} BDT)`,
    });
  }
  for (const b of budgets) {
    if (b.level !== "red" && b.level !== "orange") continue;
    alerts.push({
      level: b.level === "red" ? "red" : "orange", href: `/plan?month=${q.month}`,
      text: `${b.brandName} has used ${Math.round(b.pct ?? 0)}% of its ${formatMonth(q.month)} budget`,
    });
  }
  for (const u of recentUploads) {
    // Same tolerance as the upload check: under 1 taka apart counts as matching.
    if (u.controlTotal === null || Math.abs(u.controlTotal - u.rowsTotal) < 1 || dayDiff(u.createdAt, q.today) > UPLOAD_REVIEW_DAYS) continue;
    alerts.push({ level: "orange", href: "/uploads", text: `Upload "${u.fileName}" was saved with totals that did not match. Check it.` });
  }
  for (const s of sources) {
    if (!s.lastUpdatedAt || !s.stale) continue;
    alerts.push({ level: "orange", href: "/competitors", text: `${s.label} not updated for ${s.daysSince} days` });
  }
  // Red first; the order inside each level stays as added (bills, budgets, uploads, sources).
  alerts.sort((a, b) => (a.level === b.level ? 0 : a.level === "red" ? -1 : 1));

  return {
    budgets,
    bills,
    reminders,
    bestReach,
    live: campaigns.filter((c) => c.startDate <= q.today),
    startingSoon: campaigns.filter((c) => c.startDate > q.today).sort((a, b) => a.startDate.localeCompare(b.startDate)),
    alerts,
    thresholds: t,
  };
}
export type HomeData = Awaited<ReturnType<typeof homeData>>;
