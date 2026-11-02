import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { brands, competitorAds, competitorMedia, competitorYoutube, rivals, sourceOwners } from "@/db/schema";
import type { Db } from "@/db/types";
import { logChange } from "@/db/history";
import { addMonths, isIsoDate, isMonth } from "@/lib/month";
import { ValidationError } from "./errors";
import { normName } from "./lookups";

export type CompetitorMediaType = "TV" | "Press" | "Radio";
export const MEDIA_TYPES: CompetitorMediaType[] = ["TV", "Press", "Radio"];
export type AdPlatform = "Meta" | "TikTok";
export const AD_PLATFORMS: AdPlatform[] = ["Meta", "TikTok"];

const MEDIA_ALIASES: Record<string, CompetitorMediaType> = {
  tv: "TV", television: "TV", press: "Press", print: "Press", newspaper: "Press", newspapers: "Press", radio: "Radio", fm: "Radio",
};
export function parseMediaType(s: string): CompetitorMediaType | null {
  return MEDIA_ALIASES[normName(s)] ?? null;
}

// ---------- Sources ----------

export type SourceKey = "competitor_media" | "meta_ads" | "youtube" | "tiktok_ads";
export const SOURCES: { key: SourceKey; label: string }[] = [
  { key: "competitor_media", label: "TV, Press and Radio (upload)" },
  { key: "meta_ads", label: "Meta ad log" },
  { key: "youtube", label: "YouTube snapshot" },
  { key: "tiktok_ads", label: "TikTok ad log" },
];
export const STALE_DAYS = 35;

export async function touchSource(db: Db, key: SourceKey) {
  await db.insert(sourceOwners).values({ sourceKey: key, lastUpdatedAt: sql`now()` })
    .onConflictDoUpdate({ target: sourceOwners.sourceKey, set: { lastUpdatedAt: sql`now()` } });
}

const dayNumber = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 86_400_000;

export async function listSources(db: Db, today: string) {
  const rows = await db.select().from(sourceOwners);
  return SOURCES.map((s) => {
    const r = rows.find((x) => x.sourceKey === s.key);
    const last = r?.lastUpdatedAt ?? null;
    const age = last ? dayNumber(today) - dayNumber(new Date(last).toISOString()) : null;
    return { ...s, ownerName: r?.ownerName ?? null, lastUpdatedAt: last, daysSince: age, stale: age === null || age > STALE_DAYS };
  });
}
export type SourceRow = Awaited<ReturnType<typeof listSources>>[number];

export async function setSourceOwner(db: Db, key: SourceKey, ownerName: string) {
  if (!SOURCES.some((s) => s.key === key)) throw new ValidationError("Unknown source");
  const name = ownerName.trim().replace(/\s+/g, " ") || null;
  const [before] = await db.select().from(sourceOwners).where(eq(sourceOwners.sourceKey, key));
  const [row] = await db.insert(sourceOwners).values({ sourceKey: key, ownerName: name })
    .onConflictDoUpdate({ target: sourceOwners.sourceKey, set: { ownerName: name } }).returning();
  await logChange(db, { entity: "source_owner", entityId: key, action: before ? "update" : "create", before: before ?? null, after: row });
}

// ---------- Shared checks ----------

async function checkBrandRival(db: Db, brandId: number, rivalId: number | null, rivalRequired = false) {
  const [b] = await db.select({ id: brands.id }).from(brands).where(eq(brands.id, brandId));
  if (!b) throw new ValidationError("Brand not found");
  if (rivalId === null) {
    if (rivalRequired) throw new ValidationError("Choose a rival");
    return;
  }
  const [r] = await db.select({ id: rivals.id }).from(rivals).where(and(eq(rivals.id, rivalId), eq(rivals.brandId, brandId)));
  if (!r) throw new ValidationError("That rival is not set up for this brand. Add it in Settings.");
}

function wholeOrNull(v: number | null | undefined, label: string) {
  if (v === null || v === undefined) return null;
  if (!Number.isInteger(v) || v < 0) throw new ValidationError(`${label} must be a whole number, 0 or more`);
  return v;
}

const rivalIs = (col: typeof competitorMedia.rivalId | typeof competitorYoutube.rivalId, rivalId: number | null) => (rivalId === null ? isNull(col) : eq(col, rivalId));

// ---------- TV, Press, Radio ----------

export type CompetitorMediaInput = {
  brandId: number;
  month: string;
  rivalId: number | null;
  media: CompetitorMediaType | string;
  spend?: number | null;
  spots?: number | null;
  shareOfVoice?: number | null;
};

/** Checks the numbers of one media row. Shared by manual entry and upload. */
export function checkMediaNumbers(i: { spend?: number | null; spots?: number | null; shareOfVoice?: number | null }) {
  const spend = wholeOrNull(i.spend, "Spend");
  const spots = wholeOrNull(i.spots, "Spots");
  const sov = i.shareOfVoice ?? null;
  if (sov !== null && (!Number.isFinite(sov) || sov < 0 || sov > 100)) throw new ValidationError("Share of voice must be between 0 and 100");
  if (spend === null && spots === null && sov === null) throw new ValidationError("Enter spend, spots or share of voice");
  return { spend, spots, shareOfVoice: sov };
}

const MEDIA_DUPLICATE = "This brand already has a row for that name, media and month. Edit the existing row instead.";

export async function saveCompetitorMedia(db: Db, id: number | null, input: CompetitorMediaInput) {
  if (!isMonth(input.month)) throw new ValidationError("Month must look like 2026-10");
  const media = MEDIA_TYPES.includes(input.media as CompetitorMediaType) ? (input.media as CompetitorMediaType) : null;
  if (!media) throw new ValidationError("Media must be TV, Press or Radio");
  await checkBrandRival(db, input.brandId, input.rivalId);
  const values = { brandId: input.brandId, month: input.month, rivalId: input.rivalId, media, ...checkMediaNumbers(input) };
  const clash = await db.select({ id: competitorMedia.id }).from(competitorMedia).where(and(
    eq(competitorMedia.brandId, values.brandId), eq(competitorMedia.month, values.month), eq(competitorMedia.media, media),
    rivalIs(competitorMedia.rivalId, values.rivalId), ...(id ? [ne(competitorMedia.id, id)] : []),
  ));
  if (clash.length) throw new ValidationError(MEDIA_DUPLICATE);

  let row;
  if (id) {
    const [before] = await db.select().from(competitorMedia).where(eq(competitorMedia.id, id));
    if (!before) throw new ValidationError("Row not found");
    [row] = await db.update(competitorMedia).set({ ...values, source: "manual", updatedAt: sql`now()` }).where(eq(competitorMedia.id, id)).returning();
    await logChange(db, { entity: "competitor_media", entityId: id, action: "update", before, after: row });
  } else {
    [row] = await db.insert(competitorMedia).values({ ...values, source: "manual" }).returning();
    await logChange(db, { entity: "competitor_media", entityId: row.id, action: "create", after: row });
  }
  await touchSource(db, "competitor_media");
  return row;
}

export async function deleteCompetitorMedia(db: Db, id: number) {
  const [before] = await db.delete(competitorMedia).where(eq(competitorMedia.id, id)).returning();
  if (!before) throw new ValidationError("Row not found");
  await logChange(db, { entity: "competitor_media", entityId: id, action: "delete", before });
  await touchSource(db, "competitor_media");
}

async function subjectsOf(db: Db, brandId: number) {
  const [b] = await db.select({ id: brands.id, name: brands.name }).from(brands).where(eq(brands.id, brandId));
  if (!b) throw new ValidationError("Brand not found");
  const rs = await db.select({ id: rivals.id, name: rivals.name }).from(rivals).where(eq(rivals.brandId, brandId)).orderBy(asc(rivals.sort), asc(rivals.id));
  return [{ rivalId: null as number | null, name: b.name, isOwn: true }, ...rs.map((r) => ({ rivalId: r.id as number | null, name: r.name, isOwn: false }))];
}

export async function listCompetitorMedia(db: Db, q: { brandId: number; month: string }) {
  const subjects = await subjectsOf(db, q.brandId);
  const rows = await db.select().from(competitorMedia)
    .where(and(eq(competitorMedia.brandId, q.brandId), eq(competitorMedia.month, q.month)));
  const order = (r: { rivalId: number | null }) => subjects.findIndex((s) => s.rivalId === r.rivalId);
  return rows
    .map((r) => {
      const s = subjects[order(r)];
      return { ...r, subjectName: s?.name ?? "Removed rival", isOwn: r.rivalId === null };
    })
    .sort((a, b) => order(a) - order(b) || MEDIA_TYPES.indexOf(a.media) - MEDIA_TYPES.indexOf(b.media));
}
export type CompetitorMediaView = Awaited<ReturnType<typeof listCompetitorMedia>>[number];

export type SubjectSummary = {
  key: string; rivalId: number | null; name: string; isOwn: boolean; spend: number; spots: number;
  shareOfVoice: number | null; byMedia: Record<CompetitorMediaType, { spend: number; spots: number }>;
};

export async function competitorOverview(db: Db, q: { brandId: number; month: string }): Promise<SubjectSummary[]> {
  const [subjects, rows] = await Promise.all([
    subjectsOf(db, q.brandId),
    db.select().from(competitorMedia).where(and(eq(competitorMedia.brandId, q.brandId), eq(competitorMedia.month, q.month))),
  ]);
  const out = subjects.map((s) => {
    const mine = rows.filter((r) => r.rivalId === s.rivalId);
    const byMedia = Object.fromEntries(MEDIA_TYPES.map((m) => {
      const ms = mine.filter((r) => r.media === m);
      return [m, { spend: ms.reduce((t, r) => t + (r.spend ?? 0), 0), spots: ms.reduce((t, r) => t + (r.spots ?? 0), 0) }];
    })) as SubjectSummary["byMedia"];
    const spend = MEDIA_TYPES.reduce((t, m) => t + byMedia[m].spend, 0);
    const spots = MEDIA_TYPES.reduce((t, m) => t + byMedia[m].spots, 0);
    return { key: s.rivalId === null ? "own" : `rival-${s.rivalId}`, rivalId: s.rivalId, name: s.name, isOwn: s.isOwn, spend, spots, byMedia, shareOfVoice: null as number | null };
  });
  const total = out.reduce((t, s) => t + s.spend, 0);
  for (const s of out) s.shareOfVoice = total > 0 && s.spend > 0 ? (s.spend / total) * 100 : null;
  return out;
}

// ---------- Meta and TikTok ad log ----------

export type CompetitorAdInput = {
  brandId: number;
  rivalId: number;
  platform: AdPlatform | string;
  adUrl?: string | null;
  startedOn?: string | null;
  hook?: string | null;
  cta?: string | null;
  visualStyle?: string | null;
  tone?: string | null;
  notes?: string | null;
};

const text = (v: string | null | undefined) => v?.trim().replace(/\s+/g, " ") || null;
const sourceForPlatform = (p: AdPlatform): SourceKey => (p === "Meta" ? "meta_ads" : "tiktok_ads");

export async function saveCompetitorAd(db: Db, id: number | null, input: CompetitorAdInput) {
  const platform = AD_PLATFORMS.includes(input.platform as AdPlatform) ? (input.platform as AdPlatform) : null;
  if (!platform) throw new ValidationError("Platform must be Meta or TikTok");
  await checkBrandRival(db, input.brandId, input.rivalId ?? null, true);
  const adUrl = text(input.adUrl);
  if (adUrl) {
    let ok = false;
    try {
      ok = ["http:", "https:"].includes(new URL(adUrl).protocol);
    } catch {}
    if (!ok) throw new ValidationError("Ad link must start with http:// or https://");
  }
  const startedOn = text(input.startedOn);
  if (startedOn && !isIsoDate(startedOn)) throw new ValidationError("Start date is not a valid date");
  const values = {
    brandId: input.brandId, rivalId: input.rivalId, platform, adUrl, startedOn,
    hook: text(input.hook), cta: text(input.cta), visualStyle: text(input.visualStyle), tone: text(input.tone), notes: input.notes?.trim() || null,
  };
  let row;
  if (id) {
    const [before] = await db.select().from(competitorAds).where(eq(competitorAds.id, id));
    if (!before) throw new ValidationError("Ad not found");
    [row] = await db.update(competitorAds).set({ ...values, source: "manual", updatedAt: sql`now()` }).where(eq(competitorAds.id, id)).returning();
    await logChange(db, { entity: "competitor_ad", entityId: id, action: "update", before, after: row });
  } else {
    [row] = await db.insert(competitorAds).values({ ...values, source: "manual" }).returning();
    await logChange(db, { entity: "competitor_ad", entityId: row.id, action: "create", after: row });
  }
  await touchSource(db, sourceForPlatform(platform));
  return row;
}

export async function deleteCompetitorAd(db: Db, id: number) {
  const [before] = await db.delete(competitorAds).where(eq(competitorAds.id, id)).returning();
  if (!before) throw new ValidationError("Ad not found");
  await logChange(db, { entity: "competitor_ad", entityId: id, action: "delete", before });
  await touchSource(db, sourceForPlatform(before.platform));
}

export async function listCompetitorAds(db: Db, q: { brandId: number }) {
  return db
    .select({
      id: competitorAds.id, brandId: competitorAds.brandId, rivalId: competitorAds.rivalId, rivalName: rivals.name, platform: competitorAds.platform,
      adUrl: competitorAds.adUrl, startedOn: competitorAds.startedOn, hook: competitorAds.hook, cta: competitorAds.cta,
      visualStyle: competitorAds.visualStyle, tone: competitorAds.tone, notes: competitorAds.notes, updatedAt: competitorAds.updatedAt,
    })
    .from(competitorAds)
    .innerJoin(rivals, eq(competitorAds.rivalId, rivals.id))
    .where(eq(competitorAds.brandId, q.brandId))
    .orderBy(sql`${competitorAds.startedOn} desc nulls last`, desc(competitorAds.id));
}
export type CompetitorAdView = Awaited<ReturnType<typeof listCompetitorAds>>[number];

// ---------- YouTube monthly snapshot ----------

export type YoutubeRowInput = {
  rivalId: number | null;
  subscribers?: number | null;
  totalViews?: number | null;
  videos?: number | null;
  latestUploadOn?: string | null;
};

export async function saveYoutubeMonth(db: Db, input: { brandId: number; month: string; rows: YoutubeRowInput[] }) {
  if (!isMonth(input.month)) throw new ValidationError("Month must look like 2026-10");
  for (const r of input.rows) await checkBrandRival(db, input.brandId, r.rivalId);
  const checked = input.rows.map((r) => {
    const latestUploadOn = text(r.latestUploadOn);
    if (latestUploadOn && !isIsoDate(latestUploadOn)) throw new ValidationError("Latest upload date is not a valid date");
    const v = {
      subscribers: wholeOrNull(r.subscribers, "Subscribers"), totalViews: wholeOrNull(r.totalViews, "Total views"),
      videos: wholeOrNull(r.videos, "Videos"), latestUploadOn,
    };
    return { rivalId: r.rivalId, values: Object.values(v).every((x) => x === null) ? null : v };
  });

  let saved = 0;
  let removed = 0;
  for (const { rivalId, values } of checked) {
    const where = and(eq(competitorYoutube.brandId, input.brandId), eq(competitorYoutube.month, input.month), rivalIs(competitorYoutube.rivalId, rivalId));
    const [before] = await db.select().from(competitorYoutube).where(where);
    if (!values) {
      if (!before) continue;
      await db.delete(competitorYoutube).where(eq(competitorYoutube.id, before.id));
      await logChange(db, { entity: "competitor_youtube", entityId: before.id, action: "delete", before });
      removed++;
      continue;
    }
    if (before) {
      const [row] = await db.update(competitorYoutube).set({ ...values, source: "manual", updatedAt: sql`now()` }).where(eq(competitorYoutube.id, before.id)).returning();
      await logChange(db, { entity: "competitor_youtube", entityId: row.id, action: "update", before, after: row });
    } else {
      const [row] = await db.insert(competitorYoutube).values({ ...values, brandId: input.brandId, month: input.month, rivalId, source: "manual" }).returning();
      await logChange(db, { entity: "competitor_youtube", entityId: row.id, action: "create", after: row });
    }
    saved++;
  }
  if (saved || removed) await touchSource(db, "youtube");
  return { saved, removed };
}

export async function listYoutube(db: Db, q: { brandId: number; month: string }) {
  const subjects = await subjectsOf(db, q.brandId);
  const prevMonth = addMonths(q.month, -1);
  const rows = await db.select().from(competitorYoutube)
    .where(and(eq(competitorYoutube.brandId, q.brandId), inArray(competitorYoutube.month, [q.month, prevMonth])));
  return subjects.map((s) => {
    const cur = rows.find((r) => r.month === q.month && r.rivalId === s.rivalId);
    const prev = rows.find((r) => r.month === prevMonth && r.rivalId === s.rivalId);
    return {
      key: s.rivalId === null ? "own" : `rival-${s.rivalId}`, rivalId: s.rivalId, name: s.name, isOwn: s.isOwn,
      subscribers: cur?.subscribers ?? null, totalViews: cur?.totalViews ?? null, videos: cur?.videos ?? null, latestUploadOn: cur?.latestUploadOn ?? null,
      subscriberChange: cur?.subscribers != null && prev?.subscribers != null ? cur.subscribers - prev.subscribers : null,
      updatedAt: cur?.updatedAt ?? null,
    };
  });
}
export type YoutubeView = Awaited<ReturnType<typeof listYoutube>>[number];
