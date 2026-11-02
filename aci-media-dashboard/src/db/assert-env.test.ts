import { describe, it, expect } from "vitest";
import { assertEnv } from "./assert-env";

const URL_DEV = "postgresql://u:secretpw@ep-dev-123456-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";

describe("assertEnv", () => {
  it("returns the url when endpoint matches", () => {
    expect(assertEnv({ DATABASE_URL: URL_DEV, NEON_EXPECTED_ENDPOINT: "ep-dev-123456" }).databaseUrl).toBe(URL_DEV);
  });
  it("fails when DATABASE_URL is missing", () => {
    expect(() => assertEnv({ NEON_EXPECTED_ENDPOINT: "ep-dev-123456" })).toThrow(/DATABASE_URL is not set/);
  });
  it("fails when NEON_EXPECTED_ENDPOINT is missing", () => {
    expect(() => assertEnv({ DATABASE_URL: URL_DEV })).toThrow(/NEON_EXPECTED_ENDPOINT is not set/);
  });
  it("fails on a different endpoint and never leaks the password", () => {
    let msg = "";
    try {
      assertEnv({ DATABASE_URL: URL_DEV, NEON_EXPECTED_ENDPOINT: "ep-main-999999" });
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toMatch(/expected endpoint "ep-main-999999"/);
    expect(msg).not.toContain("secretpw");
  });
  it("fails on an invalid url", () => {
    expect(() => assertEnv({ DATABASE_URL: "not a url", NEON_EXPECTED_ENDPOINT: "ep-x" })).toThrow(/not a valid URL/);
  });
});
