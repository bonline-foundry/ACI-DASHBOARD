import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { seedReferenceData } from "@/db/seed";
import type { Db } from "@/db/types";
import { sourceOwners, uploads } from "@/db/schema";
import { saveBill } from "./billing";
import { addRival, createBrand, listBusinesses } from "./master-data";
import { createCampaign, listChannels, setBudget } from "./plan";
import { savePerformanceMonth } from "./performance";
import { createSpendEntry } from "./spend";
import { saveCompetitorAd } from "./competitors";
import { homeData } from "./home";

let db: Db;
let savlon: number;
let ch: Record<string, number>;
const TODAY = "2026-11-02";
const MONTH = "2026-11";

beforeEach(async () => {
  db = await createTestDb();
  await seedReferenceData(db);
  savlon = (await createBrand(db, { name: "Savlon Soap", businessId: (await listBusinesses(db))[0].id })).id;
  ch = Object.fromEntries((await listChannels(db)).map((c) => [c.code, c.id]));
});

const campaign = (name: string, startDate: string, endDate: string) =>
  createCampaign(db, { brandId: savlon, name, startDate, endDate, status: "planned", lines: [{ channelId: ch.TV, plannedAmount: 1000 }] });

describe("homeData", () => {
  it("is calm on an empty database", async () => {
    const h = await homeData(db, { today: TODAY, month: MONTH });
    expect(h.alerts).toEqual([]);
    expect(h.bestReach).toBeNull();
    expect(h.live).toEqual([]);
    expect(h.startingSoon).toEqual([]);
    expect(h.budgets.map((b) => b.level)).toEqual(["no-budget"]);
  });

  it("splits live campaigns from those starting in the next 14 days", async () => {
    await campaign("Running", "2026-10-20", "2026-11-10");
    await campaign("Soon", "2026-11-10", "2026-11-30");
    await campaign("Edge", "2026-11-16", "2026-11-20");
    await campaign("Too late", "2026-11-17", "2026-11-30");
    await campaign("Over", "2026-10-01", "2026-11-01");
    const h = await homeData(db, { today: TODAY, month: MONTH });
    expect(h.live.map((c) => c.name)).toEqual(["Running"]);
    expect(h.startingSoon.map((c) => c.name)).toEqual(["Soon", "Edge"]);
  });

  it("uses the latest month with reach numbers for best reach", async () => {
    await savePerformanceMonth(db, { brandId: savlon, month: "2026-09", rows: [{ channelId: ch.TV, spend: 1000, peopleReached: 1000 }] });
    await savePerformanceMonth(db, { brandId: savlon, month: "2026-10", rows: [
      { channelId: ch.TV, spend: 4000, peopleReached: 1000 }, { channelId: ch.META, spend: 500, peopleReached: 1000 },
    ] });
    await savePerformanceMonth(db, { brandId: savlon, month: "2026-12", rows: [{ channelId: ch.RADIO, spend: 1, peopleReached: 1000 }] });
    const h = await homeData(db, { today: TODAY, month: MONTH });
    expect(h.bestReach).toMatchObject({ month: "2026-10", row: { code: "META", costPer1000: 500 } });
  });

  it("raises each alert", async () => {
    await saveBill(db, null, { billNo: "OLD", month: "2026-09", billDate: "2026-09-15", amount: 700 });
    await saveBill(db, null, { billNo: "NEW", month: "2026-11", billDate: "2026-11-01", amount: 5 });
    await setBudget(db, { brandId: savlon, month: MONTH, amount: 1000, reason: "test" });
    await createSpendEntry(db, { brandId: savlon, month: MONTH, channelId: ch.TV, amount: 950 });
    await db.insert(uploads).values([
      { kind: "spend", fileName: "mismatch.xlsx", fileHash: "a", periods: [MONTH], rowCount: 1, controlTotal: 10, rowsTotal: 9, rows: [], createdAt: "2026-10-30T10:00:00Z" },
      { kind: "spend", fileName: "old-mismatch.xlsx", fileHash: "b", periods: ["2026-08"], rowCount: 1, controlTotal: 10, rowsTotal: 9, rows: [], createdAt: "2026-08-01T10:00:00Z" },
      { kind: "spend", fileName: "fine.xlsx", fileHash: "c", periods: [MONTH], rowCount: 1, controlTotal: 9, rowsTotal: 9, rows: [], createdAt: "2026-10-30T10:00:00Z" },
    ]);
    const rival = await addRival(db, { brandId: savlon, name: "Dettol" });
    await saveCompetitorAd(db, null, { brandId: savlon, rivalId: rival.id, platform: "Meta" });
    await db.update(sourceOwners).set({ lastUpdatedAt: "2026-09-01T00:00:00Z" });

    const h = await homeData(db, { today: TODAY, month: MONTH });
    expect(h.alerts.map((a) => [a.level, a.href])).toEqual([
      ["red", "/billing?age=red"],
      ["orange", "/plan?month=2026-11"],
      ["orange", "/uploads"],
      ["orange", "/competitors"],
    ]);
    expect(h.alerts[0].text).toContain("1 bill");
    expect(h.alerts[1].text).toContain("Savlon Soap");
    expect(h.alerts[2].text).toContain("mismatch.xlsx");
    expect(h.alerts[3].text).toContain("Meta ad log");
    expect(h.bills.red).toEqual({ count: 1, amount: 700 });
  });
});
