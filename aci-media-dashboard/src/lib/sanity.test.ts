import { describe, it, expect } from "vitest";

describe("toolchain", () => {
  it("runs vitest with path aliases", async () => {
    const utils = await import("@/lib/utils");
    expect(typeof utils.cn).toBe("function");
  });
});
