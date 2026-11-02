import { historyLog } from "./schema";
import type { Db } from "./types";

export type HistoryEntry = {
  entity: string;
  entityId: string | number;
  action: "create" | "update" | "delete" | "upload" | "restore";
  before?: unknown;
  after?: unknown;
  reason?: string;
};

export async function logChange(db: Db, e: HistoryEntry): Promise<void> {
  await db.insert(historyLog).values({
    actor: "Admin",
    entity: e.entity,
    entityId: String(e.entityId),
    action: e.action,
    before: e.before ?? null,
    after: e.after ?? null,
    reason: e.reason ?? null,
  });
}
