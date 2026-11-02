import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { seedReferenceData } from "@/db/seed";
import type { Db } from "@/db/types";
import { digitalEntries, historyLog } from "@/db/schema";
import { ValidationError } from "./errors";
import { createBrand, listBusinesses } from "./master-data";
import { listChannels } from "./plan";
import { createSpendEntry } from "./spend";
import {
  deleteDigitalEntry, digitalSpendByBusiness, digitalSummary, listDigital, listDigitalPlatforms, saveDigitalEntry, type DigitalInput,
} from "./digital";

let db: Db;
let savlon: number;
let salt: number;
let ch: Record<string, number>;

beforeEach(async () => {
  db = await createTestDb();
  await seedReferenceData(db);
  const biz = await listBusinesses(db);
  savlon = (await createBrand(db, { name: "Savlon Soap", businessId: biz.find((b) => b.name === "Hygiene")!.id })).id;
  salt = (await createBrand(db, { name: "ACI Pure Salt", businessId: biz.find((b) => b.name === "Salt")!.id })).id;
  ch = Object.fromEntries((await listChannels(db)).map((c) => [c.code, c.id]));
});

const entry = (patch: Partial<DigitalInput> = {}): DigitalInput => ({ brandId: savlon, month: "2026-10", platformId: ch.META, spend: 1000, ...patch });

describe("digital entries", () => {
  it("lists only Meta, YouTube and TikTok as platforms", async () => {
    expect((await listDigitalPlatforms(db)).map((p) => p.code)).toEqual(["META", "YOUTUBE", "TIKTOK"]);
  });

  it.each([
    ["bad month", { month: "Oct" }],
    ["non-digital platform", { platformId: -1 }],
    ["negative spend", { spend: -1 }],
    ["fractional reach", { reach: 1.5 }],
    ["unknown brand", { brandId: 9999 }],
    ["no numbers", { spend: null }],
  ])("rejects %s", async (_l, patch: Partial<DigitalInput>) => {
    const p = patch.platformId === -1 ? { ...patch, platformId: ch.TV } : patch;
    await expect(saveDigitalEntry(db, null, entry(p))).rejects.toThrow(ValidationError);
  });

  it("rejects a second entry for the same brand, month and platform", async () => {
    await saveDigitalEntry(db, null, entry());
    await expect(saveDigitalEntry(db, null, entry())).rejects.toThrow(/already has/);
  });

  it("creates, updates to manual, derives CPM and cost per view, deletes with history", async () => {
    const e = await saveDigitalEntry(db, null, entry({ spend: 50_000, impressions: 1_000_000, thruplays: 25_000, reach: 400_000 }));
    let [row] = await listDigital(db, { month: "2026-10" });
    expect(row).toMatchObject({ brandName: "Savlon Soap", platformCode: "META", cpm: 50, cpmDerived: true, costPerView: 2, costPerViewDerived: true });

    await db.update(digitalEntries).set({ source: "upload" });
    await saveDigitalEntry(db, e.id, entry({ spend: 50_000, cpm: 48.5 }));
    [row] = await listDigital(db, { month: "2026-10" });
    expect(row).toMatchObject({ source: "manual", cpm: 48.5, cpmDerived: false, costPerView: null, impressions: null });

    await deleteDigitalEntry(db, e.id);
    expect(await listDigital(db, { month: "2026-10" })).toHaveLength(0);
    const actions = (await db.select().from(historyLog)).filter((h) => h.entity === "digital").map((h) => h.action);
    expect(actions).toEqual(["create", "update", "delete"]);
  });
});

describe("digital summaries", () => {
  it("sums per platform and works out cost per view from totals", async () => {
    await saveDigitalEntry(db, null, entry({ spend: 30_000, reach: 100_000, thruplays: 10_000, impressions: 300_000 }));
    await saveDigitalEntry(db, null, entry({ brandId: salt, spend: 10_000, reach: 50_000, thruplays: 10_000 }));
    await saveDigitalEntry(db, null, entry({ platformId: ch.YOUTUBE, spend: 5_000, reach: 20_000 }));
    const s = await digitalSummary(db, { month: "2026-10" });
    expect(s.map((p) => p.code)).toEqual(["META", "YOUTUBE", "TIKTOK"]);
    expect(s[0]).toMatchObject({ spend: 40_000, reach: 150_000, thruplays: 20_000, costPerView: 2, cpm: 100 });
    expect(s[1]).toMatchObject({ reach: 20_000, costPerView: null });
    expect(s[2]).toMatchObject({ spend: 0, reach: 0, hasData: false });
    expect((await digitalSummary(db, { month: "2026-10", brandId: salt }))[0]).toMatchObject({ spend: 10_000 });
  });

  it("totals digital spend from the Spend module by business", async () => {
    await createSpendEntry(db, { brandId: savlon, month: "2026-10", channelId: ch.META, amount: 700 });
    await createSpendEntry(db, { brandId: savlon, month: "2026-10", channelId: ch.YOUTUBE, amount: 300 });
    await createSpendEntry(db, { brandId: salt, month: "2026-10", channelId: ch.TIKTOK, amount: 200 });
    await createSpendEntry(db, { brandId: salt, month: "2026-10", channelId: ch.TV, amount: 9_999 });
    expect(await digitalSpendByBusiness(db, { month: "2026-10" })).toEqual([
      { name: "Hygiene", amount: 1000 },
      { name: "Salt", amount: 200 },
    ]);
  });
});
