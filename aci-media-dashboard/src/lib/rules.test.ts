import { describe, it, expect } from "vitest";
import { billAgeDays, ageBucket, budgetStatus, costPer1000, prorateByMonth, DEFAULT_THRESHOLDS } from "./rules";

describe("bill aging", () => {
  it("counts days and ignores paid bills", () => {
    expect(billAgeDays("2026-10-01", "2026-10-31")).toBe(30);
    expect(billAgeDays("2026-10-01", "2026-10-31", "2026-10-20")).toBeNull();
    expect(billAgeDays("2026-11-05", "2026-11-02")).toBe(0);
  });
  it("buckets by thresholds", () => {
    expect(ageBucket(14)).toBe("fresh");
    expect(ageBucket(15)).toBe("yellow");
    expect(ageBucket(29)).toBe("yellow");
    expect(ageBucket(30)).toBe("red");
    expect(ageBucket(null)).toBeNull();
    expect(ageBucket(10, { ...DEFAULT_THRESHOLDS, billYellowDays: 7 })).toBe("yellow");
  });
});

describe("budget status", () => {
  it("colours by percent used", () => {
    expect(budgetStatus(89, 100)).toEqual({ pct: 89, level: "ok" });
    expect(budgetStatus(90, 100).level).toBe("orange");
    expect(budgetStatus(100, 100).level).toBe("red");
    expect(budgetStatus(5, 0)).toEqual({ pct: null, level: "no-budget" });
    expect(budgetStatus(5, null).level).toBe("no-budget");
  });
});

describe("cost per 1,000 reached", () => {
  it("computes and guards zero reach", () => {
    expect(costPer1000(50000, 1000000)).toBe(50);
    expect(costPer1000(50000, 0)).toBeNull();
    expect(costPer1000(50000, null)).toBeNull();
  });
});

describe("prorateByMonth", () => {
  it("keeps a single-month campaign whole", () => {
    expect(prorateByMonth("2026-10-01", "2026-10-31", 3100)).toEqual({ "2026-10": 3100 });
  });
  it("splits by days and sums exactly", () => {
    const r = prorateByMonth("2026-10-22", "2026-11-10", 1000); // 10 days Oct, 10 days Nov
    expect(r).toEqual({ "2026-10": 500, "2026-11": 500 });
    const odd = prorateByMonth("2026-10-31", "2026-11-02", 100); // 1 + 2 days
    expect(odd["2026-10"] + odd["2026-11"]).toBe(100);
    expect(odd["2026-11"]).toBe(67);
  });
  it("rejects end before start", () => {
    expect(() => prorateByMonth("2026-10-10", "2026-10-01", 1)).toThrow(/before start/);
  });
});
