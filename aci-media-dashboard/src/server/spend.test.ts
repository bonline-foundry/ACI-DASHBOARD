import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { seedReferenceData } from "@/db/seed";
import type { Db } from "@/db/types";
import { historyLog, spendEntries } from "@/db/schema";
import { ValidationError } from "./errors";
import { createBrand, createTvStation, createVendor, listBusinesses } from "./master-data";
import { listChannels } from "./plan";
import {
  createSpendEntry, deleteSpendEntry, listSpendEntries, spendBreakdown, spendMatrix, updateSpendEntry, type SpendInput,
} from "./spend";

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

const entry = (patch: Partial<SpendInput> = {}): SpendInput => ({ brandId: savlon, month: "2026-10", channelId: ch.TV, amount: 1000, ...patch });

describe("manual spend entries", () => {
  it.each([
    ["bad month", { month: "Oct" }],
    ["negative", { amount: -1 }],
    ["fraction", { amount: 1.5 }],
    ["date outside month", { entryDate: "2026-11-01" }],
    ["unknown brand", { brandId: 9999 }],
    ["unknown channel", { channelId: 9999 }],
  ])("rejects %s", async (_l, patch) => {
    await expect(createSpendEntry(db, entry(patch as Partial<SpendInput>))).rejects.toThrow(ValidationError);
  });

  it("creates, updates, deletes with history and names", async () => {
    const atn = await createTvStation(db, "ATN News");
    const asiatic = await createVendor(db, { name: "Asiatic", kind: "agency" });
    const e = await createSpendEntry(db, entry({ tvStationId: atn.id, vendorId: asiatic.id, entryDate: "2026-10-05", note: " spot " }));
    let [row] = await listSpendEntries(db, { month: "2026-10" });
    expect(row).toMatchObject({ id: e.id, brandName: "Savlon Soap", channelName: "TV", tvStationName: "ATN News", vendorName: "Asiatic", amount: 1000, note: "spot", source: "manual" });

    await db.update(spendEntries).set({ source: "upload" });
    await updateSpendEntry(db, e.id, entry({ amount: 2500 }));
    [row] = await listSpendEntries(db, { month: "2026-10" });
    expect(row).toMatchObject({ amount: 2500, source: "manual", tvStationName: null });

    await deleteSpendEntry(db, e.id);
    expect(await listSpendEntries(db, { month: "2026-10" })).toHaveLength(0);
    const actions = (await db.select().from(historyLog)).filter((h) => h.entity === "spend").map((h) => h.action);
    expect(actions).toEqual(["create", "update", "delete"]);
  });
});

describe("spendMatrix and breakdown", () => {
  beforeEach(async () => {
    const atn = await createTvStation(db, "ATN News");
    await db.insert(spendEntries).values([
      { brandId: savlon, month: "2026-09", channelId: ch.TV, tvStationId: atn.id, amount: 100, source: "upload" },
      { brandId: savlon, month: "2026-10", channelId: ch.TV, tvStationId: atn.id, amount: 200, source: "upload" },
      { brandId: savlon, month: "2026-10", channelId: ch.META, amount: 50, source: "manual" },
      { brandId: salt, month: "2026-10", channelId: ch.OOH, amount: 30, source: "manual" },
      { brandId: salt, month: "2026-08", channelId: ch.OOH, amount: 999, source: "manual" },
    ]);
  });

  it("sums by brand and month with source summary", async () => {
    const m = await spendMatrix(db, { months: ["2026-09", "2026-10"] });
    const s = m.rows.find((r) => r.brandId === savlon)!;
    expect(s.cells).toEqual({ "2026-09": 100, "2026-10": 250 });
    expect(s.total).toBe(350);
    expect(s.source).toBe("mixed");
    const a = m.rows.find((r) => r.brandId === salt)!;
    expect(a).toMatchObject({ total: 30, source: "manual" });
    expect(m.totals).toEqual({ "2026-09": 100, "2026-10": 280 });
    expect(m.grandTotal).toBe(380);
  });

  it("filters by channel group and brand", async () => {
    const digital = await spendMatrix(db, { months: ["2026-10"], group: "DIGITAL" });
    expect(digital.grandTotal).toBe(50);
    const tv = await spendMatrix(db, { months: ["2026-09", "2026-10"], group: "TV", brandId: savlon });
    expect(tv.rows.map((r) => r.total)).toEqual([300]);
  });

  it("breaks down by TV station and vendor", async () => {
    expect(await spendBreakdown(db, { month: "2026-10", by: "tvStation" })).toEqual([{ name: "ATN News", amount: 200 }]);
    expect(await spendBreakdown(db, { month: "2026-10", by: "vendor" })).toEqual([{ name: "Not set", amount: 280 }]);
  });
});
