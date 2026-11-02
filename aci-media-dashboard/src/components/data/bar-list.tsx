import { cn } from "@/lib/utils";

export type BarRow = { key: string; label: string; value: number | null; display: string; note?: string; highlight?: boolean };

/** Horizontal bars. Rows with a null value show "No data" and no bar. */
export function BarList({ rows, color = "bg-primary", testId, empty }: { rows: BarRow[]; color?: string; testId?: string; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-gray-500">{empty}</p>;
  const max = Math.max(1, ...rows.map((r) => r.value ?? 0));
  return (
    <ul className="space-y-3" data-testid={testId}>
      {rows.map((r) => (
        <li key={r.key} className="text-sm" data-testid={testId ? `${testId}-${r.key}` : undefined}>
          <div className="flex items-baseline justify-between gap-2">
            <span className={cn(r.highlight && "font-medium")}>
              {r.label}
              {r.note && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">{r.note}</span>}
            </span>
            <span className={cn("tabular-nums", r.value === null && "text-gray-400")}>{r.value === null ? "No data" : r.display}</span>
          </div>
          <div className="mt-1 h-2 rounded bg-gray-100">
            {r.value !== null && <div className={cn("h-2 rounded", color)} style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />}
          </div>
        </li>
      ))}
    </ul>
  );
}
