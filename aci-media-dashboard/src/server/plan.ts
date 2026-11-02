import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { brands, budgets, campaignLines, campaigns, channels, spendEntries } from "@/db/schema";
import type { Db } from "@/db/types";
import { logChange } from "@/db/history";
import { isIsoDate, isMonth, monthBounds } from "@/lib/month";
import { budgetStatus, prorateByMonth, type BudgetLevel } from "@/lib/rules";
import { ValidationError } from "./errors";
import { getThresholds } from "./master-data";

export type CampaignStatus = "planned" | "live" | "done";

export type CampaignInput = {
  brandId: number;
  name: string;
  startDate: string;
  endDate: string;
  status: CampaignStatus;
  notes?: string | null;
  lines: { channelId: number; plannedAmount: number }[];
};

export type CampaignView = {
  id: number;
  brandId: number;
  brandName: string;
  name: string;
  startDate: string;
  endDate: string;
  status: CampaignStatus;
  notes: string | null;
  source: "upload" | "manual";
  updatedAt: string;
  total: number;
  lines: { channelId: number; code: string; name: string; plannedAmount: number }[];
};

export type BudgetRow = {
  brandId: number;
  brandName: string;
  budget: number | null;
  planned: number;
  actual: number;
  level: BudgetLevel;
  pct: number | null;
  plannedOverBudget: boolean;
};

const STATUSES: CampaignStatus[] = ["planned", "live", "done"];

export async function listChannels(db: Db) {
  return db.select().from(channels).orderBy(asc(channels.id));
}

async function validate(db: Db, input: CampaignInput) {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) throw new ValidationError("Campaign name is required");
  if (!isIsoDate(input.startDate) || !isIsoDate(input.endDate)) throw new ValidationError("Start and end must be valid dates");
  if (input.endDate < input.startDate) throw new ValidationError("End date is before start date");
  if (!STATUSES.includes(input.status)) throw new ValidationError("Unknown status");
  if (input.lines.length === 0) throw new ValidationError("Add at least one channel with a planned amount");
  for (const l of input.lines) {
    if (!Number.isInteger(l.plannedAmount) || l.plannedAmount < 0) throw new ValidationError("Planned amounts must be whole taka, 0 or more");
  }
  const channelIds = [...new Set(input.lines.map((l) => l.channelId))];
  if (channelIds.length !== input.lines.length) throw new ValidationError("Each channel can appear only once");
  const found = await db.select({ id: channels.id }).from(channels).where(inArray(channels.id, channelIds));
  if (found.length !== channelIds.length) throw new ValidationError("Unknown channel");
  const [brand] = await db.select({ id: brands.id }).from(brands).where(eq(brands.id, input.brandId));
  if (!brand) throw new ValidationError("Brand not found");
  return { name, notes: input.notes?.trim() || null };
}

async function snapshot(db: Db, id: number): Promise<CampaignView | null> {
  const [c] = await listCampaignsWhere(db, eq(campaigns.id, id));
  return c ?? null;
}

export async function createCampaign(db: Db, input: CampaignInput) {
  const { name, notes } = await validate(db, input);
  const [row] = await db
    .insert(campaigns)
    .values({ brandId: input.brandId, name, startDate: input.startDate, endDate: input.endDate, status: input.status, notes, source: "manual" })
    .returning();
  await db.insert(campaignLines).values(input.lines.map((l) => ({ campaignId: row.id, ...l })));
  await logChange(db, { entity: "campaign", entityId: row.id, action: "create", after: await snapshot(db, row.id) });
  return row;
}

export async function updateCampaign(db: Db, id: number, input: CampaignInput) {
  const before = await snapshot(db, id);
  if (!before) throw new ValidationError("Campaign not found");
  const { name, notes } = await validate(db, input);
  await db
    .update(campaigns)
    .set({
      brandId: input.brandId, name, startDate: input.startDate, endDate: input.endDate, status: input.status, notes,
      source: "manual", updatedAt: sql`now()`,
    })
    .where(eq(campaigns.id, id));
  await db.delete(campaignLines).where(eq(campaignLines.campaignId, id));
  await db.insert(campaignLines).values(input.lines.map((l) => ({ campaignId: id, ...l })));
  await logChange(db, { entity: "campaign", entityId: id, action: "update", before, after: await snapshot(db, id) });
}

export async function deleteCampaign(db: Db, id: number) {
  const before = await snapshot(db, id);
  if (!before) throw new ValidationError("Campaign not found");
  await db.delete(campaigns).where(eq(campaigns.id, id));
  await logChange(db, { entity: "campaign", entityId: id, action: "delete", before });
}

async function listCampaignsWhere(db: Db, where: ReturnType<typeof and>): Promise<CampaignView[]> {
  const rows = await db
    .select({
      id: campaigns.id, brandId: campaigns.brandId, brandName: brands.name, name: campaigns.name,
      startDate: campaigns.startDate, endDate: campaigns.endDate, status: campaigns.status, notes: campaigns.notes,
      source: campaigns.source, updatedAt: campaigns.updatedAt,
    })
    .from(campaigns)
    .innerJoin(brands, eq(campaigns.brandId, brands.id))
    .where(where)
    .orderBy(asc(campaigns.startDate), asc(campaigns.id));
  if (rows.length === 0) return [];
  const lines = await db
    .select({ campaignId: campaignLines.campaignId, channelId: campaignLines.channelId, code: channels.code, name: channels.name, plannedAmount: campaignLines.plannedAmount })
    .from(campaignLines)
    .innerJoin(channels, eq(campaignLines.channelId, channels.id))
    .where(inArray(campaignLines.campaignId, rows.map((r) => r.id)))
    .orderBy(asc(channels.id));
  return rows.map((r) => {
    const own = lines
      .filter((l) => l.campaignId === r.id)
      .map((l) => ({ channelId: l.channelId, code: l.code, name: l.name, plannedAmount: l.plannedAmount }));
    return { ...r, lines: own, total: own.reduce((s, l) => s + l.plannedAmount, 0) };
  });
}

export async function listCampaigns(db: Db, q: { from: string; to: string; brandId?: number }): Promise<CampaignView[]> {
  const conds = [lte(campaigns.startDate, q.to), gte(campaigns.endDate, q.from)];
  if (q.brandId) conds.push(eq(campaigns.brandId, q.brandId));
  return listCampaignsWhere(db, and(...conds));
}

export async function setBudget(db: Db, input: { brandId: number; month: string; amount: number; reason: string }) {
  const reason = input.reason.trim();
  if (!reason) throw new ValidationError("A reason is required for budget changes");
  if (!isMonth(input.month)) throw new ValidationError("Month must look like 2026-10");
  if (!Number.isInteger(input.amount) || input.amount < 0) throw new ValidationError("Budget must be whole taka, 0 or more");
  const [before] = await db.select().from(budgets).where(and(eq(budgets.brandId, input.brandId), eq(budgets.month, input.month)));
  const [row] = await db
    .insert(budgets)
    .values({ brandId: input.brandId, month: input.month, amount: input.amount })
    .onConflictDoUpdate({ target: [budgets.brandId, budgets.month], set: { amount: input.amount, updatedAt: sql`now()` } })
    .returning();
  await logChange(db, { entity: "budget", entityId: row.id, action: before ? "update" : "create", before: before ?? null, after: row, reason });
  return row;
}

export async function planVsBudget(db: Db, month: string, brandId?: number): Promise<BudgetRow[]> {
  const t = await getThresholds(db);
  const { start, end } = monthBounds(month);
  const brandRows = await db
    .select({ id: brands.id, name: brands.name })
    .from(brands)
    .where(brandId ? eq(brands.id, brandId) : eq(brands.active, true))
    .orderBy(asc(brands.name));
  const budgetRows = await db.select().from(budgets).where(eq(budgets.month, month));
  const actualRows = await db
    .select({ brandId: spendEntries.brandId, total: sql<string>`sum(${spendEntries.amount})` })
    .from(spendEntries)
    .where(eq(spendEntries.month, month))
    .groupBy(spendEntries.brandId);
  const camps = await listCampaigns(db, { from: start, to: end, brandId });

  return brandRows.map((b) => {
    const budget = budgetRows.find((x) => x.brandId === b.id)?.amount ?? null;
    const actual = Number(actualRows.find((x) => x.brandId === b.id)?.total ?? 0);
    const planned = camps
      .filter((c) => c.brandId === b.id)
      .flatMap((c) => c.lines.map((l) => prorateByMonth(c.startDate, c.endDate, l.plannedAmount)[month] ?? 0))
      .reduce((s, v) => s + v, 0);
    const { pct, level } = budgetStatus(actual, budget, t);
    return { brandId: b.id, brandName: b.name, budget, planned, actual, level, pct, plannedOverBudget: budget !== null && planned > budget };
  });
}
