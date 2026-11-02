import { describe, it, expect } from "vitest";
import { createTestDb } from "./test-db";
import { seedReferenceData, BUSINESS_NAMES, CHANNELS } from "./seed";
import { businesses, channels, settings } from "./schema";
import { DEFAULT_THRESHOLDS } from "@/lib/rules";

describe("schema + seed", () => {
  it("migrates and seeds reference data idempotently", async () => {
    const db = await createTestDb();
    await seedReferenceData(db);
    await seedReferenceData(db);
    const b = await db.select().from(businesses);
    expect(b.map((x) => x.name).sort()).toEqual([...BUSINESS_NAMES].sort());
    const c = await db.select().from(channels);
    expect(c).toHaveLength(CHANNELS.length);
    const s = await db.select().from(settings);
    expect(s).toEqual([{ key: "thresholds", value: DEFAULT_THRESHOLDS }]);
  });
});
