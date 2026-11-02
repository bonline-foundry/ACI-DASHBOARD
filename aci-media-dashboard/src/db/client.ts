import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";
import { assertEnv } from "./assert-env";
import type { Db } from "./types";

neonConfig.webSocketConstructor = ws;

let db: Db | undefined;

export function getDb(): Db {
  if (!db) {
    const { databaseUrl } = assertEnv(process.env);
    db = drizzle({ client: new Pool({ connectionString: databaseUrl }), schema }) as unknown as Db;
  }
  return db;
}
