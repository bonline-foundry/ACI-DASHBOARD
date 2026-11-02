import { and, asc, eq, inArray, ne, sql, type SQL } from "drizzle-orm";
import { brands, businesses, channels, digitalEntries, spendEntries } from "@/db/schema";
import type { Db } from "@/db/types";
import { logChange } from "@/db/history";
import { isMonth } from "@/lib/month";
import { ValidationError, isUniqueViolation } from "./errors";
import { CHANNEL_GROUPS } from "./spend";

export type DigitalInput = {
  brandId: number;
  month: string;
  platformId: number;
  spend?: number | null;
  reach?: number | null;
  impressions?: number | null;
  cpm?: number | null;
  thruplays?: number | null;
  costPerView?: number | null;
  engagement?: number | null;
};

export const DIGITAL_COUNTS = ["spend", "reach", "impressions", "thruplays", "engagement"] as const;
export const DIGITAL_RATES = ["cpm", "costPerView"] as const;
const LABELS: Record<(typeof DIGITAL_COUNTS)[number] | (typeof DIGITAL_RATES)[number], string> = {
  spend: "Spend", reach: "Reach", impressions: "Impressions", thruplays: "ThruPlays", engagement: "Post engagement",
  cpm: "CPM", costPerView: "Cost per view",
};

export type DigitalValues = Record<(typeof DIGITAL_COUNTS)[number] | (typeof DIGITAL_RATES)[number], number | null>;

/** Checks the numbers of one digital row. Shared by manual entry and upload. */
export function checkDigitalNumbers(i: Partial<DigitalValues>): DigitalValues {
  const out = {} as DigitalValues;
  for (const k of DIGITAL_COUNTS) {
    const v = i[k] ?? null;
    if (v !== null && (!Number.isInteger(v) || v < 0)) throw new ValidationError(`${LABELS[k]} must be a whole number, 0 or more`);
    out[k] = v;
  }
  for (const k of DIGITAL_RATES) {
    const v = i[k] ?? null;
    if (v !== null && (!Number.isFinite(v) || v < 0)) throw new ValidationError(`${LABELS[k]} must be 0 or more`);
    out[k] = v;
  }
  if (Object.values(out).every((v) => v === null)) throw new ValidationError("Enter at least one number");
  return out;
}

export async function listDigitalPlatforms(db: Db) {
  return db.select({ id: channels.id, code: channels.code, name: channels.name }).from(channels)
    .where(eq(channels.parentCode, "DIGITAL")).orderBy(asc(channels.id));
}

async function validate(db: Db, i: DigitalInput) {
  if (!isMonth(i.month)) throw new ValidationError("Month must look like 2026-10");
  const [b] = await db.select({ id: brands.id }).from(brands).where(eq(brands.id, i.brandId));
  if (!b) throw new ValidationError("Brand not found");
  if (!(await listDigitalPlatforms(db)).some((p) => p.id === i.platformId)) throw new ValidationError("Platform must be Meta, YouTube or TikTok");
  return { brandId: i.brandId, month: i.month, platformId: i.platformId, ...checkDigitalNumbers(i) };
}

const DUPLICATE = "This brand already has results for that platform and month. Edit the existing row instead.";

export async function saveDigitalEntry(db: Db, id: number | null, input: DigitalInput) {
  const values = await validate(db, input);
  const clash = await db.select({ id: digitalEntries.id }).from(digitalEntries).where(and(
    eq(digitalEntries.brandId, values.brandId), eq(digitalEntries.month, values.month), eq(digitalEntries.platformId, values.platformId),
    ...(id ? [ne(digitalEntries.id, id)] : []),
  ));
  if (clash.length) throw new ValidationError(DUPLICATE);
  try {
    if (!id) {
      const [row] = await db.insert(digitalEntries).values({ ...values, source: "manual" }).returning();
      await logChange(db, { entity: "digital", entityId: row.id, action: "create", after: row });
      return row;
    }
    const [before] = await db.select().from(digitalEntries).where(eq(digitalEntries.id, id));
    if (!before) throw new ValidationError("Digital entry not found");
    const [row] = await db.update(digitalEntries)
      .set({ ...values, source: "manual", updatedAt: sql`now()` }).where(eq(digitalEntries.id, id)).returning();
    await logChange(db, { entity: "digital", entityId: id, action: "update", before, after: row });
    return row;
  } catch (e) {
    if (isUniqueViolation(e)) throw new ValidationError(DUPLICATE);
    throw e;
  }
}

export async function deleteDigitalEntry(db: Db, id: number) {
  const [before] = await db.delete(digitalEntries).where(eq(digitalEntries.id, id)).returning();
  if (!before) throw new ValidationError("Digital entry not found");
  await logChange(db, { entity: "digital", entityId: id, action: "delete", before });
}

const rate = (spend: number | null, base: number | null, per = 1) => (spend !== null && base ? (spend / base) * per : null);

export async function listDigital(db: Db, q: { month: string; brandId?: number }) {
  const conds: SQL[] = [eq(digitalEntries.month, q.month)];
  if (q.brandId) conds.push(eq(digitalEntries.brandId, q.brandId));
  const rows = await db
    .select({
      id: digitalEntries.id, brandId: digitalEntries.brandId, brandName: brands.name, month: digitalEntries.month,
      platformId: digitalEntries.platformId, platformCode: channels.code, platformName: channels.name,
      spend: digitalEntries.spend, reach: digitalEntries.reach, impressions: digitalEntries.impressions, cpm: digitalEntries.cpm,
      thruplays: digitalEntries.thruplays, costPerView: digitalEntries.costPerView, engagement: digitalEntries.engagement,
      source: digitalEntries.source, updatedAt: digitalEntries.updatedAt,
    })
    .from(digitalEntries)
    .innerJoin(brands, eq(digitalEntries.brandId, brands.id))
    .innerJoin(channels, eq(digitalEntries.platformId, channels.id))
    .where(and(...conds))
    .orderBy(asc(brands.name), asc(channels.id));
  // When CPM or cost per view is left blank, work it out from spend.
  return rows.map((r) => {
    const cpm = r.cpm ?? rate(r.spend, r.impressions, 1000);
    const costPerView = r.costPerView ?? rate(r.spend, r.thruplays);
    return { ...r, cpm, cpmDerived: r.cpm === null && cpm !== null, costPerView, costPerViewDerived: r.costPerView === null && costPerView !== null };
  });
}

export type DigitalView = Awaited<ReturnType<typeof listDigital>>[number];

export type PlatformSummary = {
  platformId: number; code: string; name: string; hasData: boolean;
  spend: number; reach: number; impressions: number; thruplays: number; engagement: number;
  cpm: number | null; costPerView: number | null;
};

export async function digitalSummary(db: Db, q: { month: string; brandId?: number }): Promise<PlatformSummary[]> {
  const conds: SQL[] = [eq(digitalEntries.month, q.month)];
  if (q.brandId) conds.push(eq(digitalEntries.brandId, q.brandId));
  const sum = (c: typeof digitalEntries.spend) => sql<string>`coalesce(sum(${c}), 0)`;
  // Rates use only the spend of rows that have the matching base number.
  const spendWhere = (c: typeof digitalEntries.spend) => sql<string>`coalesce(sum(${digitalEntries.spend}) filter (where ${c} > 0), 0)`;
  const [platforms, raw] = await Promise.all([
    listDigitalPlatforms(db),
    db.select({
      platformId: digitalEntries.platformId, n: sql<string>`count(*)`,
      spend: sum(digitalEntries.spend), reach: sum(digitalEntries.reach), impressions: sum(digitalEntries.impressions),
      thruplays: sum(digitalEntries.thruplays), engagement: sum(digitalEntries.engagement),
      cpmSpend: spendWhere(digitalEntries.impressions), viewSpend: spendWhere(digitalEntries.thruplays),
    }).from(digitalEntries).where(and(...conds)).groupBy(digitalEntries.platformId),
  ]);
  return platforms.map((p) => {
    const r = raw.find((x) => x.platformId === p.id);
    const n = (v: string | undefined) => Number(v ?? 0);
    return {
      platformId: p.id, code: p.code, name: p.name, hasData: Boolean(r),
      spend: n(r?.spend), reach: n(r?.reach), impressions: n(r?.impressions), thruplays: n(r?.thruplays), engagement: n(r?.engagement),
      cpm: rate(n(r?.cpmSpend), n(r?.impressions), 1000), costPerView: rate(n(r?.viewSpend), n(r?.thruplays)),
    };
  });
}

/** Digital spend comes from the Spend module, so the two pages always agree. */
export async function digitalSpendByBusiness(db: Db, q: { month: string; brandId?: number }) {
  const conds: SQL[] = [eq(spendEntries.month, q.month), inArray(channels.code, CHANNEL_GROUPS.DIGITAL)];
  if (q.brandId) conds.push(eq(spendEntries.brandId, q.brandId));
  const rows = await db
    .select({ name: businesses.name, amount: sql<string>`sum(${spendEntries.amount})` })
    .from(spendEntries)
    .innerJoin(channels, eq(spendEntries.channelId, channels.id))
    .innerJoin(brands, eq(spendEntries.brandId, brands.id))
    .innerJoin(businesses, eq(brands.businessId, businesses.id))
    .where(and(...conds))
    .groupBy(businesses.name)
    .orderBy(sql`sum(${spendEntries.amount}) desc`);
  return rows.map((r) => ({ name: r.name, amount: Number(r.amount) }));
}
