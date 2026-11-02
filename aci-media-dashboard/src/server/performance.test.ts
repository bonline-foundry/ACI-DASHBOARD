import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { seedReferenceData } from "@/db/seed";
import type { Db } from "@/db/types";
import { historyLog, performanceEntries } from "@/db/schema";
import { ValidationError } from "./errors";
import { createBrand, listBusinesses } from "./master-data";
import { listChannels } from "./plan";
import { listPerformance, reachCost, savePerformanceMonth, type PerformanceRowInput } from "./performance";

let db: Db;
let savlon: number;
let salt: number;
let ch: Record<string, number>;

beforeEach(async () => {
  db = await createTestDb();
  await seedReferenceData(db);
  const biz = (await listBusinesses(db))[0].id;
  savlon = (await createBrand(db, { name: "Savlon Soap", businessId: biz })).id;
  salt = (await createBrand(db, { name: "ACI Pure Salt", businessId: biz })).id;
  ch = Object.fromEntries((await listChannels(db)).map((c) => [c.code, c.id]));
});

const save = (rows: PerformanceRowInput[], brandId = savlon, month = "2026-10") => savePerformanceMonth(db, { brandId, month, rows });

describe("savePerformanceMonth", () => {
  it.each([
    ["bad month", { month: "Oct" }, [{ channelId: 0, spend: 1 }]],
    ["unknown brand", { brandId: 9999 }, [{ channelId: 0, spend: 1 }]],
  ])("rejects %s", async (_l, patch, rows) => {
    const input = { brandId: savlon, month: "2026-10", ...patch, rows: rows.map((r) => ({ ...r, channelId: ch.TV })) };
    await expect(savePerformanceMonth(db, input)).rejects.toThrow(ValidationError);
  });

  it.each([
    ["unknown channel", { channelId: 9999, spend: 1 }],
    ["negative spend", { spend: -1 }],
    ["fractional spend", { spend: 1.5 }],
    ["negative reach", { spend: 1, peopleReached: -5 }],
    ["share over 100", { spend: 1, shareOfVoice: 120 }],
    ["reach without spend", { spend: null, peopleReached: 100 }],
  ])("rejects row with %s", async (_l, patch: Partial<PerformanceRowInput>) => {
    await expect(save([{ channelId: ch.TV, spend: 1, ...patch }])).rejects.toThrow(ValidationError);
  });

  it("rejects TV-only numbers on other channels", async () => {
    await expect(save([{ channelId: ch.META, spend: 100, grp: 50 }])).rejects.toThrow(/only for TV/);
  });

  it("upserts rows, deletes blank rows, marks manual and logs history", async () => {
    expect(await save([
      { channelId: ch.TV, spend: 4_000_000, peopleReached: 2_000_000, grp: 310, shareOfVoice: 22.5 },
      { channelId: ch.META, spend: 1_000_000, peopleReached: 4_000_000 },
    ])).toEqual({ saved: 2, removed: 0 });
    await db.update(performanceEntries).set({ source: "upload" });

    expect(await save([
      { channelId: ch.TV, spend: 5_000_000, peopleReached: 2_000_000 },
      { channelId: ch.META, spend: null, peopleReached: null },
    ])).toEqual({ saved: 1, removed: 1 });

    const rows = await listPerformance(db, { month: "2026-10" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ brandName: "Savlon Soap", channelCode: "TV", spend: 5_000_000, grp: null, source: "manual", costPer1000: 2500 });
    const actions = (await db.select().from(historyLog)).filter((h) => h.entity === "performance").map((h) => h.action);
    expect(actions).toEqual(["create", "create", "update", "delete"]);
  });
});

describe("reachCost", () => {
  it("sums brands per channel, cheapest first, no-data last, filtered by view", async () => {
    await save([
      { channelId: ch.TV, spend: 4_000_000, peopleReached: 1_000_000 },
      { channelId: ch.META, spend: 500_000, peopleReached: 1_000_000 },
      { channelId: ch.PRESS, spend: 300_000 },
    ]);
    await save([{ channelId: ch.TV, spend: 2_000_000, peopleReached: 2_000_000 }], salt);
    await save([{ channelId: ch.YOUTUBE, spend: 9, peopleReached: 9 }], savlon, "2026-09");

    const all = await reachCost(db, { month: "2026-10" });
    expect(all.map((r) => [r.code, r.costPer1000])).toEqual([["META", 500], ["TV", 2000], ["PRESS", null]]);
    expect(all[1]).toMatchObject({ spend: 6_000_000, peopleReached: 3_000_000 });

    expect((await reachCost(db, { month: "2026-10", brandId: salt })).map((r) => r.code)).toEqual(["TV"]);
    expect((await reachCost(db, { month: "2026-10", view: "TV" })).map((r) => r.code)).toEqual(["TV"]);
    expect((await reachCost(db, { month: "2026-10", view: "DIGITAL" })).map((r) => r.code)).toEqual(["META"]);
  });
});
