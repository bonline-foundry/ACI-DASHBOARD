import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatTone = "neutral" | "good" | "warn" | "bad" | "accent";

const TONE: Record<StatTone, { dot: string; line: string }> = {
  neutral: { dot: "bg-gray-300", line: "stroke-gray-400" },
  good: { dot: "bg-emerald-500", line: "stroke-emerald-500" },
  warn: { dot: "bg-amber-500", line: "stroke-amber-500" },
  bad: { dot: "bg-red-500", line: "stroke-red-500" },
  accent: { dot: "bg-primary", line: "stroke-primary" },
};

/** Small trend line like the Wix key-stat boxes. Needs at least 2 points. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${28 - ((v - min) / span) * 24}`).join(" ");
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className={cn("h-8 w-24 overflow-visible", className)} aria-hidden>
      <polyline points={pts} fill="none" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * One key stat: label, big number, short note, optional trend.
 * With `href` the whole box is the link, so the click target is as large as the box (Fitts's law).
 */
export function StatCard({
  label, value, note, href, tone = "neutral", active, testId, trend,
}: { label: string; value: ReactNode; note?: ReactNode; href?: string; tone?: StatTone; active?: boolean; testId?: string; trend?: number[] }) {
  const body = (
    <>
      <p className="flex items-center gap-2 text-sm text-gray-600">
        <span className={cn("size-2 rounded-[2px]", TONE[tone].dot)} aria-hidden />
        {label}
      </p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className="text-2xl leading-none font-semibold tracking-tight text-gray-900 tabular-nums md:text-[28px]">{value}</p>
        {trend && <Sparkline values={trend} className={TONE[tone].line} />}
      </div>
      {note && <p className="mt-2 truncate text-xs text-gray-500 tabular-nums">{note}</p>}
    </>
  );
  const base = cn("block rounded-lg border border-gray-200 bg-white p-4 md:p-5", active && "border-primary ring-1 ring-primary");
  return href ? (
    <Link href={href} data-testid={testId} className={cn(base, "transition-[border-color,box-shadow] hover:border-primary/50 hover:shadow-md")}>{body}</Link>
  ) : (
    <div data-testid={testId} className={base}>{body}</div>
  );
}

/** Up to 4 stats in a row (Miller's law). */
export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">{children}</div>;
}
