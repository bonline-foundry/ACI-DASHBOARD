export function planMerge<T extends { key: string }>(
  existing: { key: string; source: "upload" | "manual" }[],
  incoming: T[],
): { toInsert: T[]; conflicts: T[] } {
  const manual = new Set(existing.filter((e) => e.source === "manual").map((e) => e.key));
  const toInsert: T[] = [];
  const conflicts: T[] = [];
  for (const row of incoming) (manual.has(row.key) ? conflicts : toInsert).push(row);
  return { toInsert, conflicts };
}
