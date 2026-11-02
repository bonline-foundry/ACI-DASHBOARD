import { and, asc, desc, eq, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { brands, channels, spendEntries, tvStations, vendors } from "@/db/schema";
import type { Db } from "@/db/types";
import { logChange } from "@/db/history";
import { isIsoDate, isMonth } from "@/lib/month";
import { ValidationError } from "./errors";

export type ChannelGroup = "TV" | "PRESS" | "RADIO" | "OOH" | "DIGITAL";
export const CHANNEL_GROUPS: Record<ChannelGroup, string[]> = {
  TV: ["TV"],
  PRESS: ["PRESS"],
  RADIO: ["RADIO"],
  OOH: ["OOH"],
  DIGITAL: ["DIGITAL", "META", "YOUTUBE", "TIKTOK"],
};

export type SpendInput = {
  brandId: number;
  month: string;
  entryDate?: string | null;
  channelId: number;
  tvStationId?: number | null;
  vendorId?: number | null;
  amount: number;
  note?: string | null;
};

export type SourceSummary = "upload" | "manual" | "mixed" | null;

async function validate(db: Db, i: SpendInput) {
  if (!isMonth(i.month)) throw new ValidationError("Month must look like 2026-10");
  const entryDate = i.entryDate?.trim() || null;
  if (entryDate && (!isIsoDate(entryDate) || !entryDate.startsWith(i.month))) throw new ValidationError("Date must be inside the chosen month");
  if (!Number.isInteger(i.amount) || i.amount < 0) throw new ValidationError("Amount must be whole taka, 0 or more");
  const [b] = await db.select({ id: brands.id }).from(brands).where(eq(brands.id, i.brandId));
  if (!b) throw new ValidationError("Brand not found");
  const [c] = await db.select({ id: channels.id }).from(channels).where(eq(channels.id, i.channelId));
  if (!c) throw new ValidationError("Channel not found");
  return {
    brandId: i.brandId, month: i.month, entryDate, channelId: i.channelId, tvStationId: i.tvStationId || null,
    vendorId: i.vendorId || null, amount: i.amount, note: i.note?.trim() || null,
  };
}

export async function createSpendEntry(db: Db, input: SpendInput) {
  const values = await validate(db, input);
  const [row] = await db.insert(spendEntries).values({ ...values, source: "manual" }).returning();
  await logChange(db, { entity: "spend", entityId: row.id, action: "create", after: row });
  return row;
}

export async function updateSpendEntry(db: Db, id: number, input: SpendInput) {
  const [before] = await db.select().from(spendEntries).where(eq(spendEntries.id, id));
  if (!before) throw new ValidationError("Spend entry not found");
  const values = await validate(db, input);
  const [row] = await db
    .update(spendEntries)
    .set({ ...values, source: "manual", updatedAt: sql`now()` })
    .where(eq(spendEntries.id, id))
    .returning();
  await logChange(db, { entity: "spend", entityId: id, action: "update", before, after: row });
  return row;
}

export async function deleteSpendEntry(db: Db, id: number) {
  const [before] = await db.delete(spendEntries).where(eq(spendEntries.id, id)).returning();
  if (!before) throw new ValidationError("Spend entry not found");
  await logChange(db, { entity: "spend", entityId: id, action: "delete", before });
}

async function groupChannelIds(db: Db, group?: ChannelGroup): Promise<number[] | null> {
  if (!group) return null;
  const rows = await db.select({ id: channels.id }).from(channels).where(inArray(channels.code, CHANNEL_GROUPS[group]));
  return rows.map((r) => r.id);
}

export async function listSpendEntries(db: Db, q: { month: string; brandId?: number }) {
  const conds: SQL[] = [eq(spendEntries.month, q.month)];
  if (q.brandId) conds.push(eq(spendEntries.brandId, q.brandId));
  return db
    .select({
      id: spendEntries.id, brandId: spendEntries.brandId, brandName: brands.name, month: spendEntries.month, entryDate: spendEntries.entryDate,
      channelId: spendEntries.channelId, channelName: channels.name, tvStationId: spendEntries.tvStationId, tvStationName: tvStations.name,
      vendorId: spendEntries.vendorId, vendorName: vendors.name, amount: spendEntries.amount, note: spendEntries.note,
      source: spendEntries.source, updatedAt: spendEntries.updatedAt,
    })
    .from(spendEntries)
    .innerJoin(brands, eq(spendEntries.brandId, brands.id))
    .innerJoin(channels, eq(spendEntries.channelId, channels.id))
    .leftJoin(tvStations, eq(spendEntries.tvStationId, tvStations.id))
    .leftJoin(vendors, eq(spendEntries.vendorId, vendors.id))
    .where(and(...conds))
    .orderBy(asc(brands.name), asc(channels.id), desc(spendEntries.amount));
}

export async function spendMatrix(db: Db, q: { months: string[]; brandId?: number; group?: ChannelGroup }) {
  const conds: SQL[] = [inArray(spendEntries.month, q.months)];
  if (q.brandId) conds.push(eq(spendEntries.brandId, q.brandId));
  const ids = await groupChannelIds(db, q.group);
  if (ids) conds.push(inArray(spendEntries.channelId, ids));
  const raw = await db
    .select({
      brandId: spendEntries.brandId, brandName: brands.name, month: spendEntries.month,
      total: sql<string>`sum(${spendEntries.amount})`,
      uploads: sql<string>`count(*) filter (where ${spendEntries.source} = 'upload')`,
      manuals: sql<string>`count(*) filter (where ${spendEntries.source} = 'manual')`,
      updatedAt: sql<string>`max(${spendEntries.updatedAt})`,
    })
    .from(spendEntries)
    .innerJoin(brands, eq(spendEntries.brandId, brands.id))
    .where(and(...conds))
    .groupBy(spendEntries.brandId, brands.name, spendEntries.month)
    .orderBy(asc(brands.name));

  const byBrand = new Map<number, { brandId: number; brandName: string; cells: Record<string, number>; total: number; up: number; man: number; updatedAt: string | null }>();
  const totals: Record<string, number> = Object.fromEntries(q.months.map((m) => [m, 0]));
  for (const r of raw) {
    const b = byBrand.get(r.brandId) ?? { brandId: r.brandId, brandName: r.brandName, cells: {}, total: 0, up: 0, man: 0, updatedAt: null };
    const amount = Number(r.total);
    b.cells[r.month] = amount;
    b.total += amount;
    b.up += Number(r.uploads);
    b.man += Number(r.manuals);
    if (!b.updatedAt || r.updatedAt > b.updatedAt) b.updatedAt = r.updatedAt;
    totals[r.month] += amount;
    byBrand.set(r.brandId, b);
  }
  const rows = [...byBrand.values()].map(({ up, man, ...b }) => ({
    ...b,
    source: (up && man ? "mixed" : up ? "upload" : man ? "manual" : null) as SourceSummary,
  }));
  return { rows, totals, grandTotal: rows.reduce((s, r) => s + r.total, 0) };
}

const tvAlias = alias(tvStations, "tv");
const vendorAlias = alias(vendors, "v");

export async function spendBreakdown(db: Db, q: { month: string; brandId?: number; by: "tvStation" | "vendor" }) {
  const conds: SQL[] = [eq(spendEntries.month, q.month)];
  if (q.brandId) conds.push(eq(spendEntries.brandId, q.brandId));
  if (q.by === "tvStation") conds.push(isNotNull(spendEntries.tvStationId));
  const nameCol = q.by === "tvStation" ? tvAlias.name : vendorAlias.name;
  const rows = await db
    .select({ name: sql<string | null>`${nameCol}`, amount: sql<string>`sum(${spendEntries.amount})` })
    .from(spendEntries)
    .leftJoin(tvAlias, eq(spendEntries.tvStationId, tvAlias.id))
    .leftJoin(vendorAlias, eq(spendEntries.vendorId, vendorAlias.id))
    .where(and(...conds))
    .groupBy(nameCol)
    .orderBy(desc(sql`sum(${spendEntries.amount})`));
  return rows.map((r) => ({ name: r.name ?? "Not set", amount: Number(r.amount) }));
}
