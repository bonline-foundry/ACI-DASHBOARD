import { loadEnvConfig } from "@next/env";
import { gte, like } from "drizzle-orm";

// Remove data created by e2e runs. Brands cascade to campaigns, budgets, rivals and spend.
export default async function globalTeardown() {
  loadEnvConfig(process.cwd());
  const { getDb } = await import("../src/db/client");
  const { brands, historyLog, tvStations, uploads } = await import("../src/db/schema");
  const db = getDb();
  await db.delete(brands).where(like(brands.name, "E2E %"));
  await db.delete(uploads).where(like(uploads.fileName, "e2e-%"));
  await db.delete(tvStations).where(like(tvStations.name, "E2E %"));
  if (process.env.E2E_STARTED_AT) await db.delete(historyLog).where(gte(historyLog.at, process.env.E2E_STARTED_AT));
}
