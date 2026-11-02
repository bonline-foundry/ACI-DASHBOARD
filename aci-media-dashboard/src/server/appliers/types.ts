import type { Db } from "@/db/types";
import type { ParsedRow, RowError } from "@/lib/upload/parse";
import type { UploadKind } from "@/lib/upload/templates";
import type { Lookups } from "../lookups";

export type Missing = { vendors: string[]; tvStations: string[] };
export type Item = { key: string };

export type Applier<T extends Item = Item> = {
  kind: UploadKind;
  /** Map parsed rows to DB-ready items. Unknown vendors / TV stations go to `missing` (created on confirm). */
  resolve(rows: ParsedRow[], lk: Lookups): { items: T[]; errors: RowError[]; missing: Missing };
  createMissing(db: Db, missing: Missing): Promise<void>;
  /** Keys of rows currently stored for these periods, with their source. */
  existingKeys(db: Db, periods: string[]): Promise<{ key: string; source: "upload" | "manual" }[]>;
  /** Delete upload-sourced rows for these periods, insert items, return inserted count. */
  replace(db: Db, periods: string[], items: T[], uploadId: number): Promise<number>;
};

export function addMissing(list: string[], name: string | null | undefined) {
  if (name && !list.some((n) => n.toLowerCase() === name.toLowerCase())) list.push(name);
}
