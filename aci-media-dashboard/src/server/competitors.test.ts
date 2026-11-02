import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { seedReferenceData } from "@/db/seed";
import type { Db } from "@/db/types";
import { competitorMedia, historyLog, sourceOwners } from "@/db/schema";
import { ValidationError } from "./errors";
import { addRival, createBrand, listBusinesses } from "./master-data";
import {
  competitorOverview, deleteCompetitorAd, deleteCompetitorMedia, listCompetitorAds, listCompetitorMedia, listSources, listYoutube,
  parseMediaType, saveCompetitorAd, saveCompetitorMedia, saveYoutubeMonth, setSourceOwner, type CompetitorAdInput, type CompetitorMediaInput,
} from "./competitors";

let db: Db;
let savlon: number;
let other: number;
let dettol: number;
let lifebuoy: number;
let foreign: number;

beforeEach(async () => {
  db = await createTestDb();
  await seedReferenceData(db);
  const biz = (await listBusinesses(db))[0].id;
  savlon = (await createBrand(db, { name: "Savlon Soap", businessId: biz })).id;
  other = (await createBrand(db, { name: "ACI Pure Salt", businessId: biz })).id;
  dettol = (await addRival(db, { brandId: savlon, name: "Dettol" })).id;
  lifebuoy = (await addRival(db, { brandId: savlon, name: "Lifebuoy" })).id;
  foreign = (await addRival(db, { brandId: other, name: "Molla Salt" })).id;
});

const media = (patch: Partial<CompetitorMediaInput> = {}): CompetitorMediaInput =>
  ({ brandId: savlon, month: "2026-10", rivalId: dettol, media: "TV", spend: 1000, ...patch });

describe("parseMediaType", () => {
  it("accepts common spellings", () => {
    expect(["tv", "Television", "print", "Newspaper", "PRESS", "radio", "fm", "OOH"].map(parseMediaType))
      .toEqual(["TV", "TV", "Press", "Press", "Press", "Radio", "Radio", null]);
  });
});

describe("competitor media", () => {
  it.each([
    ["bad month", { month: "Oct" }],
    ["rival of another brand", { rivalId: -1 }],
    ["bad media", { media: "OOH" }],
    ["negative spend", { spend: -1 }],
    ["fractional spots", { spots: 1.5 }],
    ["share over 100", { shareOfVoice: 101 }],
    ["no numbers", { spend: null }],
  ])("rejects %s", async (_l, patch: Partial<CompetitorMediaInput>) => {
    const p = patch.rivalId === -1 ? { ...patch, rivalId: foreign } : patch;
    await expect(saveCompetitorMedia(db, null, media(p))).rejects.toThrow(ValidationError);
  });

  it("blocks a second row for the same subject and media, logs history and stamps the source", async () => {
    const row = await saveCompetitorMedia(db, null, media());
    await expect(saveCompetitorMedia(db, null, media())).rejects.toThrow(/already has/);
    await saveCompetitorMedia(db, row.id, media({ spend: 2000, spots: 12 }));
    const [view] = await listCompetitorMedia(db, { brandId: savlon, month: "2026-10" });
    expect(view).toMatchObject({ subjectName: "Dettol", isOwn: false, spend: 2000, spots: 12, source: "manual" });
    await deleteCompetitorMedia(db, row.id);
    const actions = (await db.select().from(historyLog)).filter((h) => h.entity === "competitor_media").map((h) => h.action);
    expect(actions).toEqual(["create", "update", "delete"]);
    const [src] = await db.select().from(sourceOwners);
    expect(src).toMatchObject({ sourceKey: "competitor_media" });
    expect(src.lastUpdatedAt).not.toBeNull();
  });

  it("works out share of voice from spend for the brand and its rivals", async () => {
    await saveCompetitorMedia(db, null, media({ rivalId: null, media: "TV", spend: 3000, spots: 30 }));
    await saveCompetitorMedia(db, null, media({ rivalId: null, media: "Press", spend: 1000, spots: 4 }));
    await saveCompetitorMedia(db, null, media({ rivalId: dettol, media: "TV", spend: 4000, spots: 50 }));
    await saveCompetitorMedia(db, null, media({ rivalId: dettol, month: "2026-09", spend: 9999 }));
    const o = await competitorOverview(db, { brandId: savlon, month: "2026-10" });
    expect(o.map((s) => [s.name, s.spend, s.shareOfVoice])).toEqual([
      ["Savlon Soap", 4000, 50], ["Dettol", 4000, 50], ["Lifebuoy", 0, null],
    ]);
    expect(o[0].isOwn).toBe(true);
    expect(o[0].byMedia).toEqual({ TV: { spend: 3000, spots: 30 }, Press: { spend: 1000, spots: 4 }, Radio: { spend: 0, spots: 0 } });
    expect(o[2].byMedia.TV).toEqual({ spend: 0, spots: 0 });
  });
});

describe("competitor ad log", () => {
  const ad = (patch: Partial<CompetitorAdInput> = {}): CompetitorAdInput =>
    ({ brandId: savlon, rivalId: dettol, platform: "Meta", adUrl: "https://facebook.com/ads/library/?id=1", startedOn: "2026-10-03", hook: " Germ kill in 10s ", ...patch });

  it.each([
    ["rival of another brand", { rivalId: -1 }],
    ["bad platform", { platform: "YouTube" }],
    ["bad link", { adUrl: "javascript:alert(1)" }],
    ["bad date", { startedOn: "03/10/2026" }],
  ])("rejects %s", async (_l, patch: Partial<CompetitorAdInput>) => {
    const p = patch.rivalId === -1 ? { ...patch, rivalId: foreign } : patch;
    await expect(saveCompetitorAd(db, null, ad(p as Partial<CompetitorAdInput>))).rejects.toThrow(ValidationError);
  });

  it("saves, edits, lists newest first and stamps the platform source", async () => {
    const a = await saveCompetitorAd(db, null, ad());
    await saveCompetitorAd(db, null, ad({ platform: "TikTok", rivalId: lifebuoy, startedOn: "2026-10-20", adUrl: "" }));
    await saveCompetitorAd(db, a.id, ad({ tone: "Serious" }));
    const list = await listCompetitorAds(db, { brandId: savlon });
    expect(list.map((x) => [x.rivalName, x.platform])).toEqual([["Lifebuoy", "TikTok"], ["Dettol", "Meta"]]);
    expect(list[1]).toMatchObject({ hook: "Germ kill in 10s", tone: "Serious" });
    expect(list[0].adUrl).toBeNull();
    const keys = (await db.select().from(sourceOwners)).map((s) => s.sourceKey).sort();
    expect(keys).toEqual(["meta_ads", "tiktok_ads"]);
    await deleteCompetitorAd(db, a.id);
    expect(await listCompetitorAds(db, { brandId: savlon })).toHaveLength(1);
  });
});

describe("YouTube snapshot", () => {
  it("upserts the grid, removes blank rows and shows change since last month", async () => {
    await saveYoutubeMonth(db, { brandId: savlon, month: "2026-09", rows: [{ rivalId: null, subscribers: 10_000 }, { rivalId: dettol, subscribers: 50_000 }] });
    expect(await saveYoutubeMonth(db, { brandId: savlon, month: "2026-10", rows: [
      { rivalId: null, subscribers: 12_500, totalViews: 900_000, videos: 40, latestUploadOn: "2026-10-28" },
      { rivalId: dettol, subscribers: 49_000 },
      { rivalId: lifebuoy },
    ] })).toEqual({ saved: 2, removed: 0 });
    let rows = await listYoutube(db, { brandId: savlon, month: "2026-10" });
    expect(rows.map((r) => [r.name, r.subscribers, r.subscriberChange])).toEqual([
      ["Savlon Soap", 12_500, 2_500], ["Dettol", 49_000, -1_000], ["Lifebuoy", null, null],
    ]);
    expect(await saveYoutubeMonth(db, { brandId: savlon, month: "2026-10", rows: [{ rivalId: dettol }] })).toEqual({ saved: 0, removed: 1 });
    rows = await listYoutube(db, { brandId: savlon, month: "2026-10" });
    expect(rows[1].subscribers).toBeNull();
    await expect(saveYoutubeMonth(db, { brandId: savlon, month: "2026-10", rows: [{ rivalId: foreign, subscribers: 1 }] })).rejects.toThrow(ValidationError);
    await expect(saveYoutubeMonth(db, { brandId: savlon, month: "2026-10", rows: [{ rivalId: null, latestUploadOn: "2026-13-01" }] })).rejects.toThrow(ValidationError);
  });
});

describe("sources", () => {
  it("lists four sources, saves an owner and marks stale ones", async () => {
    let s = await listSources(db, "2026-11-02");
    expect(s.map((x) => [x.key, x.ownerName, x.stale])).toEqual([
      ["competitor_media", null, true], ["meta_ads", null, true], ["youtube", null, true], ["tiktok_ads", null, true],
    ]);
    await setSourceOwner(db, "meta_ads", "  Rafiq  ");
    await saveCompetitorAd(db, null, { brandId: savlon, rivalId: dettol, platform: "Meta" });
    s = await listSources(db, new Date().toISOString().slice(0, 10));
    expect(s[1]).toMatchObject({ ownerName: "Rafiq", stale: false });
    await expect(setSourceOwner(db, "nope" as never, "x")).rejects.toThrow(ValidationError);
    expect((await db.select().from(historyLog)).some((h) => h.entity === "source_owner")).toBe(true);
    expect(await db.select().from(competitorMedia)).toHaveLength(0);
  });
});
