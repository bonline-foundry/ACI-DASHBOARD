import { cn } from "@/lib/utils";

export type BarRow = { key: string; label: string; value: number | null; display: string; note?: string; highlight?: boolean };

/** Mixpanel-style horizontal bars: square colour dot, label, value on the right. Rows with a null value show "No data". */
export function BarList({ rows, color = "bg-primary", testId, empty }: { rows: BarRow[]; color?: string; testId?: string; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-gray-500">{empty}</p>;
  const max = Math.max(1, ...rows.map((r) => r.value ?? 0));
  return (
    <ul className="space-y-3.5" data-testid={testId}>
      {rows.map((r) => (
        <li key={r.key} className="text-sm" data-testid={testId ? `${testId}-${r.key}` : undefined}>
          <div className="flex items-center justify-between gap-2">
            <span className={cn("flex min-w-0 items-center gap-2 text-gray-700", r.highlight && "font-medium text-gray-900")}>
              <span className={cn("size-2 shrink-0 rounded-[2px]", r.value === null ? "bg-gray-300" : color)} aria-hidden />
              <span className="truncate">{r.label}</span>
              {r.note && <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">{r.note}</span>}
            </span>
            <span className={cn("shrink-0 font-medium text-gray-900 tabular-nums", r.value === null && "font-normal text-gray-400")}>{r.value === null ? "No data" : r.display}</span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-gray-100">
            {r.value !== null && <div className={cn("h-1.5 rounded-full", color)} style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />}
          </div>
        </li>
      ))}
    </ul>
  );
}
