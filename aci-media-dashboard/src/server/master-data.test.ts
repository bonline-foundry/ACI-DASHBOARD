import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { seedReferenceData } from "@/db/seed";
import type { Db } from "@/db/types";
import { historyLog } from "@/db/schema";
import { ValidationError } from "./errors";
import {
  listBusinesses, listBrandsWithRivals, createBrand, renameBrand, addRival, removeRival,
  createVendor, listVendors, createTvStation, listTvStations, getThresholds, setThresholds,
} from "./master-data";
import { DEFAULT_THRESHOLDS } from "@/lib/rules";

let db: Db;
let toiletriesId: number;

beforeEach(async () => {
  db = await createTestDb();
  await seedReferenceData(db);
  toiletriesId = (await listBusinesses(db)).find((b) => b.name === "Toiletries")!.id;
});

describe("brands", () => {
  it("creates, lists and logs", async () => {
    const b = await createBrand(db, { name: "  Savlon Soap ", businessId: toiletriesId });
    expect(b.name).toBe("Savlon Soap");
    const list = await listBrandsWithRivals(db);
    expect(list).toEqual([{ id: b.id, name: "Savlon Soap", businessId: toiletriesId, businessName: "Toiletries", active: true, rivals: [] }]);
    const log = await db.select().from(historyLog);
    expect(log[0]).toMatchObject({ actor: "Admin", entity: "brand", entityId: String(b.id), action: "create" });
  });
  it("rejects empty and duplicate names", async () => {
    await expect(createBrand(db, { name: " ", businessId: toiletriesId })).rejects.toThrow(ValidationError);
    await createBrand(db, { name: "Savlon Soap", businessId: toiletriesId });
    await expect(createBrand(db, { name: "Savlon Soap", businessId: toiletriesId })).rejects.toThrow(/already exists/);
  });
  it("renames", async () => {
    const b = await createBrand(db, { name: "Savlon", businessId: toiletriesId });
    await renameBrand(db, b.id, "Savlon Soap");
    expect((await listBrandsWithRivals(db))[0].name).toBe("Savlon Soap");
  });
});

describe("rivals", () => {
  it("allows at most 3 per brand", async () => {
    const b = await createBrand(db, { name: "Savlon Soap", businessId: toiletriesId });
    for (const n of ["Lifebuoy", "Dettol", "Lux"]) await addRival(db, { brandId: b.id, name: n });
    await expect(addRival(db, { brandId: b.id, name: "Sandalina" })).rejects.toThrow(/at most 3 rivals/);
    const rivals = (await listBrandsWithRivals(db))[0].rivals;
    expect(rivals.map((r) => r.name)).toEqual(["Lifebuoy", "Dettol", "Lux"]);
    await removeRival(db, rivals[0].id);
    await addRival(db, { brandId: b.id, name: "Sandalina" });
    expect((await listBrandsWithRivals(db))[0].rivals).toHaveLength(3);
  });
});

describe("vendors and tv stations", () => {
  it("creates and lists sorted", async () => {
    await createVendor(db, { name: "Mindshare", kind: "agency" });
    await createVendor(db, { name: "Asiatic", kind: "agency" });
    expect((await listVendors(db)).map((v) => v.name)).toEqual(["Asiatic", "Mindshare"]);
    await createTvStation(db, "ATN News");
    expect((await listTvStations(db)).map((t) => t.name)).toEqual(["ATN News"]);
    await expect(createTvStation(db, "ATN News")).rejects.toThrow(/already exists/);
  });
});

describe("thresholds", () => {
  it("reads defaults and validates updates", async () => {
    expect(await getThresholds(db)).toEqual(DEFAULT_THRESHOLDS);
    await setThresholds(db, { billYellowDays: 10, billRedDays: 20, budgetOrangePct: 80, budgetRedPct: 100 });
    expect((await getThresholds(db)).billYellowDays).toBe(10);
    await expect(setThresholds(db, { ...DEFAULT_THRESHOLDS, billYellowDays: 30, billRedDays: 15 })).rejects.toThrow(ValidationError);
    await expect(setThresholds(db, { ...DEFAULT_THRESHOLDS, budgetOrangePct: 110 })).rejects.toThrow(ValidationError);
  });
});
