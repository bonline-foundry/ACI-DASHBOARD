import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { seedReferenceData } from "@/db/seed";
import type { Db } from "@/db/types";
import { historyLog, spendEntries } from "@/db/schema";
import { ValidationError } from "./errors";
import { createBrand, listBusinesses } from "./master-data";
import {
  createCampaign, updateCampaign, deleteCampaign, listCampaigns, setBudget, planVsBudget, listChannels, type CampaignInput,
} from "./plan";

let db: Db;
let brandId: number;
let otherBrandId: number;
let ch: Record<string, number>;

const base = (): CampaignInput => ({
  brandId,
  name: "Puja TV burst",
  startDate: "2026-10-22",
  endDate: "2026-11-10",
  status: "planned",
  notes: null,
  lines: [{ channelId: ch.TV, plannedAmount: 1_000_000 }],
});

beforeEach(async () => {
  db = await createTestDb();
  await seedReferenceData(db);
  const biz = (await listBusinesses(db))[0].id;
  brandId = (await createBrand(db, { name: "Savlon Soap", businessId: biz })).id;
  otherBrandId = (await createBrand(db, { name: "ACI Pure Salt", businessId: biz })).id;
  ch = Object.fromEntries((await listChannels(db)).map((c) => [c.code, c.id]));
});

describe("createCampaign validation", () => {
  it.each([
    ["empty name", { name: " " }],
    ["bad date", { startDate: "2026-13-01" }],
    ["end before start", { startDate: "2026-10-10", endDate: "2026-10-01" }],
    ["no lines", { lines: [] }],
    ["negative amount", { lines: [{ channelId: 1, plannedAmount: -5 }] }],
    ["fractional amount", { lines: [{ channelId: 1, plannedAmount: 1.5 }] }],
    ["unknown brand", { brandId: 99999 }],
  ])("rejects %s", async (_label, patch) => {
    await expect(createCampaign(db, { ...base(), ...patch } as CampaignInput)).rejects.toThrow(ValidationError);
  });
});

describe("campaign CRUD", () => {
  it("creates, lists with lines and logs", async () => {
    const c = await createCampaign(db, { ...base(), lines: [{ channelId: ch.TV, plannedAmount: 700 }, { channelId: ch.META, plannedAmount: 300 }] });
    const [v] = await listCampaigns(db, { from: "2026-10-01", to: "2026-10-31" });
    expect(v).toMatchObject({ id: c.id, brandName: "Savlon Soap", name: "Puja TV burst", total: 1000, source: "manual", status: "planned" });
    expect(v.lines.map((l) => l.code).sort()).toEqual(["META", "TV"]);
    const log = await db.select().from(historyLog);
    expect(log.some((l) => l.entity === "campaign" && l.action === "create")).toBe(true);
  });

  it("filters by window and brand", async () => {
    await createCampaign(db, base());
    await createCampaign(db, { ...base(), brandId: otherBrandId, name: "Salt Dec", startDate: "2026-12-01", endDate: "2026-12-10" });
    expect((await listCampaigns(db, { from: "2026-09-01", to: "2026-09-30" }))).toHaveLength(0);
    expect((await listCampaigns(db, { from: "2026-11-01", to: "2026-11-30" })).map((c) => c.name)).toEqual(["Puja TV burst"]);
    expect((await listCampaigns(db, { from: "2026-01-01", to: "2026-12-31", brandId: otherBrandId })).map((c) => c.name)).toEqual(["Salt Dec"]);
  });

  it("updates lines and deletes", async () => {
    const c = await createCampaign(db, base());
    await updateCampaign(db, c.id, { ...base(), name: "Puja burst", status: "live", lines: [{ channelId: ch.PRESS, plannedAmount: 50 }] });
    const [v] = await listCampaigns(db, { from: "2026-10-01", to: "2026-11-30" });
    expect(v).toMatchObject({ name: "Puja burst", status: "live", total: 50 });
    expect(v.lines.map((l) => l.code)).toEqual(["PRESS"]);
    await deleteCampaign(db, c.id);
    expect(await listCampaigns(db, { from: "2026-01-01", to: "2026-12-31" })).toHaveLength(0);
    const actions = (await db.select().from(historyLog)).filter((l) => l.entity === "campaign").map((l) => l.action);
    expect(actions).toEqual(["create", "update", "delete"]);
  });
});

describe("budgets and plan vs budget", () => {
  it("requires a reason and upserts", async () => {
    await expect(setBudget(db, { brandId, month: "2026-10", amount: 100, reason: " " })).rejects.toThrow(/reason/i);
    await expect(setBudget(db, { brandId, month: "2026-10", amount: -1, reason: "x" })).rejects.toThrow(ValidationError);
    await setBudget(db, { brandId, month: "2026-10", amount: 100, reason: "Initial" });
    await setBudget(db, { brandId, month: "2026-10", amount: 1_000_000, reason: "Puja top-up" });
    const rows = await planVsBudget(db, "2026-10");
    expect(rows.find((r) => r.brandId === brandId)?.budget).toBe(1_000_000);
    const log = (await db.select().from(historyLog)).filter((l) => l.entity === "budget");
    expect(log.map((l) => l.reason)).toEqual(["Initial", "Puja top-up"]);
  });

  it("prorates plan, sums actual and colours status", async () => {
    await createCampaign(db, base()); // 10 Oct days of 20 → 500,000 in October
    await setBudget(db, { brandId, month: "2026-10", amount: 1_000_000, reason: "Plan" });
    await db.insert(spendEntries).values([
      { brandId, month: "2026-10", channelId: ch.TV, amount: 900_000 },
      { brandId, month: "2026-10", channelId: ch.META, amount: 50_000 },
      { brandId, month: "2026-09", channelId: ch.TV, amount: 999 },
    ]);
    const rows = await planVsBudget(db, "2026-10");
    const savlon = rows.find((r) => r.brandId === brandId)!;
    expect(savlon).toMatchObject({ planned: 500_000, actual: 950_000, budget: 1_000_000, level: "orange", plannedOverBudget: false });
    expect(savlon.pct).toBeCloseTo(95);
    const salt = rows.find((r) => r.brandId === otherBrandId)!;
    expect(salt).toMatchObject({ budget: null, planned: 0, actual: 0, level: "no-budget" });
    expect((await planVsBudget(db, "2026-10", otherBrandId)).map((r) => r.brandId)).toEqual([otherBrandId]);
  });

  it("flags planned over budget", async () => {
    await createCampaign(db, { ...base(), startDate: "2026-10-01", endDate: "2026-10-31" });
    await setBudget(db, { brandId, month: "2026-10", amount: 600_000, reason: "Tight" });
    const savlon = (await planVsBudget(db, "2026-10")).find((r) => r.brandId === brandId)!;
    expect(savlon.plannedOverBudget).toBe(true);
  });
});
