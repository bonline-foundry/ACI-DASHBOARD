import { describe, it, expect } from "vitest";
import { barPosition, assignLanes } from "./timeline";
import { mainChannel } from "./channel-colors";
import { todayDhaka, addMonths, daysInMonth, monthBounds } from "./month";

describe("month helpers", () => {
  it("computes Dhaka today and month arithmetic", () => {
    expect(todayDhaka(new Date("2026-11-01T20:00:00Z"))).toBe("2026-11-02");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(daysInMonth("2028-02")).toBe(29);
    expect(monthBounds("2026-10")).toEqual({ start: "2026-10-01", end: "2026-10-31" });
  });
});

describe("barPosition", () => {
  it("places and clips bars inside the month", () => {
    expect(barPosition("2026-10-05", "2026-10-10", "2026-10")).toEqual({ offset: 4, span: 6 });
    expect(barPosition("2026-09-20", "2026-10-03", "2026-10")).toEqual({ offset: 0, span: 3 });
    expect(barPosition("2026-10-30", "2026-11-04", "2026-10")).toEqual({ offset: 29, span: 2 });
    expect(barPosition("2026-11-01", "2026-11-04", "2026-10")).toBeNull();
  });
});

describe("assignLanes", () => {
  it("separates overlaps and reuses free lanes", () => {
    const lanes = assignLanes([
      { id: 1, start: "2026-10-01", end: "2026-10-10" },
      { id: 2, start: "2026-10-05", end: "2026-10-12" },
      { id: 3, start: "2026-10-11", end: "2026-10-20" },
    ]);
    expect(lanes.get(1)).toBe(0);
    expect(lanes.get(2)).toBe(1);
    expect(lanes.get(3)).toBe(0);
  });
});

describe("mainChannel", () => {
  it("picks the biggest planned line", () => {
    expect(mainChannel([{ code: "TV", plannedAmount: 5 }, { code: "META", plannedAmount: 9 }])).toBe("META");
    expect(mainChannel([])).toBeNull();
  });
});
