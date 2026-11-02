import { tvStations, vendors } from "@/db/schema";
import type { Db } from "@/db/types";
import type { Missing } from "./types";

export async function createMissingRefs(db: Db, missing: Missing) {
  if (missing.vendors.length) {
    await db.insert(vendors).values(missing.vendors.map((name) => ({ name, kind: "agency" as const }))).onConflictDoNothing();
  }
  if (missing.tvStations.length) {
    await db.insert(tvStations).values(missing.tvStations.map((name) => ({ name }))).onConflictDoNothing();
  }
}

export const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
export const num = (v: unknown) => (typeof v === "number" ? v : null);
