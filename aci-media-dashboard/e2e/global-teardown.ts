import { loadEnvConfig } from "@next/env";
import { like } from "drizzle-orm";

// Remove brands created by e2e runs (campaigns, budgets and rivals cascade).
export default async function globalTeardown() {
  loadEnvConfig(process.cwd());
  const { getDb } = await import("../src/db/client");
  const { brands } = await import("../src/db/schema");
  await getDb().delete(brands).where(like(brands.name, "E2E %"));
}
