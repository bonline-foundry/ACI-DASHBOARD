import { loadEnvConfig } from "@next/env";
import { migrate } from "drizzle-orm/neon-serverless/migrator";

loadEnvConfig(process.cwd());

async function main() {
  const { getDb } = await import("./client");
  const { seedReferenceData } = await import("./seed");
  const db = getDb();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await migrate(db as any, { migrationsFolder: "drizzle" });
  await seedReferenceData(db);
  console.log("Database migrated and reference data seeded.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
