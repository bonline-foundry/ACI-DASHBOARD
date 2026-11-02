import { describe, it, expect } from "vitest";
import { isMonth, isIsoDate, monthOf, currentMonth, formatMonth } from "./month";
import { parseAmount, formatMillion, formatTaka } from "./money";

describe("month", () => {
  it("validates months and dates", () => {
    expect(isMonth("2026-10")).toBe(true);
    expect(isMonth("2026-13")).toBe(false);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
  });
  it("derives and formats months", () => {
    expect(monthOf("2026-10-15")).toBe("2026-10");
    expect(currentMonth(new Date(Date.UTC(2026, 10, 2)))).toBe("2026-11");
    expect(formatMonth("2026-10")).toBe("October 2026");
  });
});

describe("money", () => {
  it("parses amounts", () => {
    expect(parseAmount(1200)).toBe(1200);
    expect(parseAmount("4,430,000")).toBe(4430000);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount("abc")).toBeNaN();
  });
  it("formats amounts", () => {
    expect(formatMillion(28600000)).toBe("28.60");
    expect(formatTaka(160000)).toBe("1,60,000");
  });
});
