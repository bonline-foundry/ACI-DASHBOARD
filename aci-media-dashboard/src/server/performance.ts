import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { brands, channels, performanceEntries } from "@/db/schema";
import type { Db } from "@/db/types";
import { logChange } from "@/db/history";
import { isMonth } from "@/lib/month";
import { costPer1000 } from "@/lib/rules";
import { ValidationError } from "./errors";
import { CHANNEL_GROUPS } from "./spend";

export type PerformanceRowInput = {
  channelId: number;
  spend: number | null;
  peopleReached?: number | null;
  grp?: number | null;
  shareOfVoice?: number | null;
  shareOfSpend?: number | null;
  reach1Plus?: number | null;
  cprp?: number | null;
};

export const TV_FIELDS = ["grp", "shareOfVoice", "shareOfSpend", "reach1Plus", "cprp"] as const;
const PERCENT_FIELDS = ["shareOfVoice", "shareOfSpend", "reach1Plus"] as const;
const LABELS: Record<(typeof TV_FIELDS)[number], string> = {
  grp: "GRP", shareOfVoice: "Share of voice", shareOfSpend: "Share of spend", reach1Plus: "1+ reach", cprp: "Cost per rating point",
};

export type PerformanceValues = { spend: number; peopleReached: number | null } & Record<(typeof TV_FIELDS)[number], number | null>;

const blank = (v: number | null | undefined) => v === null || v === undefined;

/** Validates one grid row. Returns null when the row is empty (it should be removed). */
export function checkPerformanceRow(r: Omit<PerformanceRowInput, "channelId">, channelCode: string): PerformanceValues | null {
  const fields = { peopleReached: r.peopleReached ?? null, ...Object.fromEntries(TV_FIELDS.map((k) => [k, r[k] ?? null])) } as Record<string, number | null>;
  if (blank(r.spend)) {
    if (Object.values(fields).some((v) => v !== null)) throw new ValidationError("Enter spend for every channel that has results");
    return null;
  }
  const spend = r.spend as number;
  if (!Number.isInteger(spend) || spend < 0) throw new ValidationError("Spend must be whole taka, 0 or more");
  const reached = fields.peopleReached;
  if (reached !== null && (!Number.isInteger(reached) || reached < 0)) throw new ValidationError("People reached must be a whole number, 0 or more");
  for (const k of TV_FIELDS) {
    const v = fields[k];
    if (v === null) continue;
    if (channelCode !== "TV") throw new ValidationError(`${LABELS[k]} is only for TV`);
    if (!Number.isFinite(v) || v < 0) throw new ValidationError(`${LABELS[k]} must be 0 or more`);
    if ((PERCENT_FIELDS as readonly string[]).includes(k) && v > 100) throw new ValidationError(`${LABELS[k]} must be between 0 and 100`);
  }
  return { spend, ...fields } as PerformanceValues;
}

export async function savePerformanceMonth(db: Db, input: { brandId: number; month: string; rows: PerformanceRowInput[] }) {
  if (!isMonth(input.month)) throw new ValidationError("Month must look like 2026-10");
  const [b] = await db.select({ id: brands.id }).from(brands).where(eq(brands.id, input.brandId));
  if (!b) throw new ValidationError("Brand not found");
  const codes = new Map((await db.select({ id: channels.id, code: channels.code }).from(channels)).map((c) => [c.id, c.code]));
  const checked = input.rows.map((r) => {
    const code = codes.get(r.channelId);
    if (!code) throw new ValidationError("Channel not found");
    return { channelId: r.channelId, values: checkPerformanceRow(r, code) };
  });

  const existing = await db.select().from(performanceEntries)
    .where(and(eq(performanceEntries.brandId, input.brandId), eq(performanceEntries.month, input.month)));
  let saved = 0;
  let removed = 0;
  for (const { channelId, values } of checked) {
    const before = existing.find((e) => e.channelId === channelId);
    if (!values) {
      if (!before) continue;
      await db.delete(performanceEntries).where(eq(performanceEntries.id, before.id));
      await logChange(db, { entity: "performance", entityId: before.id, action: "delete", before });
      removed++;
      continue;
    }
    if (before) {
      const [row] = await db.update(performanceEntries)
        .set({ ...values, source: "manual", uploadId: null, updatedAt: sql`now()` })
        .where(eq(performanceEntries.id, before.id)).returning();
      await logChange(db, { entity: "performance", entityId: row.id, action: "update", before, after: row });
    } else {
      const [row] = await db.insert(performanceEntries)
        .values({ ...values, brandId: input.brandId, month: input.month, channelId, source: "manual" }).returning();
      await logChange(db, { entity: "performance", entityId: row.id, action: "create", after: row });
    }
    saved++;
  }
  return { saved, removed };
}

export async function listPerformance(db: Db, q: { month: string; brandId?: number }) {
  const conds: SQL[] = [eq(performanceEntries.month, q.month)];
  if (q.brandId) conds.push(eq(performanceEntries.brandId, q.brandId));
  const rows = await db
    .select({
      id: performanceEntries.id, brandId: performanceEntries.brandId, brandName: brands.name, month: performanceEntries.month,
      channelId: performanceEntries.channelId, channelCode: channels.code, channelName: channels.name,
      spend: performanceEntries.spend, peopleReached: performanceEntries.peopleReached, grp: performanceEntries.grp,
      shareOfVoice: performanceEntries.shareOfVoice, shareOfSpend: performanceEntries.shareOfSpend,
      reach1Plus: performanceEntries.reach1Plus, cprp: performanceEntries.cprp,
      source: performanceEntries.source, updatedAt: performanceEntries.updatedAt,
    })
    .from(performanceEntries)
    .innerJoin(brands, eq(performanceEntries.brandId, brands.id))
    .innerJoin(channels, eq(performanceEntries.channelId, channels.id))
    .where(and(...conds))
    .orderBy(asc(brands.name), asc(channels.id));
  return rows.map((r) => ({ ...r, costPer1000: costPer1000(r.spend, r.peopleReached) }));
}

export type PerformanceView = Awaited<ReturnType<typeof listPerformance>>[number];
export type ReachView = "all" | "TV" | "DIGITAL";
export type ReachCostRow = { channelId: number; code: string; name: string; spend: number; peopleReached: number; costPer1000: number | null };

export async function reachCost(db: Db, q: { month: string; brandId?: number; view?: ReachView }): Promise<ReachCostRow[]> {
  const conds: SQL[] = [eq(performanceEntries.month, q.month)];
  if (q.brandId) conds.push(eq(performanceEntries.brandId, q.brandId));
  if (q.view && q.view !== "all") conds.push(inArray(channels.code, CHANNEL_GROUPS[q.view]));
  const raw = await db
    .select({
      channelId: channels.id, code: channels.code, name: channels.name,
      spend: sql<string>`sum(${performanceEntries.spend})`,
      // Only spend that has a reach figure counts toward cost per 1,000.
      reachedSpend: sql<string>`coalesce(sum(${performanceEntries.spend}) filter (where ${performanceEntries.peopleReached} > 0), 0)`,
      peopleReached: sql<string>`coalesce(sum(${performanceEntries.peopleReached}), 0)`,
    })
    .from(performanceEntries)
    .innerJoin(channels, eq(performanceEntries.channelId, channels.id))
    .where(and(...conds))
    .groupBy(channels.id, channels.code, channels.name);
  const rows = raw.map((r) => ({
    channelId: r.channelId, code: r.code, name: r.name, spend: Number(r.spend), peopleReached: Number(r.peopleReached),
    costPer1000: costPer1000(Number(r.reachedSpend), Number(r.peopleReached)),
  }));
  return rows.sort((a, b) => {
    if (a.costPer1000 === null || b.costPer1000 === null) return a.costPer1000 === null ? (b.costPer1000 === null ? a.channelId - b.channelId : 1) : -1;
    return a.costPer1000 - b.costPer1000;
  });
}
