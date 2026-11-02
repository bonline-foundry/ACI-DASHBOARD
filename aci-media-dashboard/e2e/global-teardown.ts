import { loadEnvConfig } from "@next/env";
import { gte, like } from "drizzle-orm";

// Remove data created by e2e runs. Brands cascade to campaigns, budgets, rivals, spend and competitor rows;
// bills cascade to their reminders. Reminders the Home "Remind" button put on other bills go by start time.
export default async function globalTeardown() {
  loadEnvConfig(process.cwd());
  const { getDb } = await import("../src/db/client");
  const { bills, brands, historyLog, reminders, sourceOwners, tvStations, uploads, vendors } = await import("../src/db/schema");
  const db = getDb();
  await db.delete(brands).where(like(brands.name, "E2E %"));
  await db.delete(uploads).where(like(uploads.fileName, "e2e-%"));
  await db.delete(tvStations).where(like(tvStations.name, "E2E %"));
  await db.delete(bills).where(like(bills.billNo, "E2E-%"));
  await db.delete(vendors).where(like(vendors.name, "E2E %"));
  if (process.env.E2E_STARTED_AT) await db.delete(reminders).where(gte(reminders.createdAt, process.env.E2E_STARTED_AT));
  if (process.env.E2E_STARTED_AT) await db.delete(historyLog).where(gte(historyLog.at, process.env.E2E_STARTED_AT));
  if (process.env.E2E_SOURCE_OWNERS) {
    const saved = JSON.parse(process.env.E2E_SOURCE_OWNERS) as (typeof sourceOwners.$inferSelect)[];
    await db.delete(sourceOwners);
    if (saved.length) await db.insert(sourceOwners).values(saved);
  }
}
