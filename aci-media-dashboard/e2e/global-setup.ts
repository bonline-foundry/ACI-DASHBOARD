import { loadEnvConfig } from "@next/env";
import { assertEnv } from "../src/db/assert-env";

export default function globalSetup() {
  loadEnvConfig(process.cwd());
  assertEnv(process.env);
  if (!process.env.NEON_DEV_ENDPOINT || process.env.NEON_EXPECTED_ENDPOINT !== process.env.NEON_DEV_ENDPOINT) {
    throw new Error("E2E tests only run against the Neon dev branch. Set NEON_EXPECTED_ENDPOINT to NEON_DEV_ENDPOINT.");
  }
  // Read by global-teardown to remove history rows written during this run.
  process.env.E2E_STARTED_AT = new Date().toISOString();
}
