import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatTone = "neutral" | "good" | "warn" | "bad" | "accent";

const TONE: Record<StatTone, string> = {
  neutral: "bg-gray-300",
  good: "bg-emerald-500",
  warn: "bg-amber-500",
  bad: "bg-red-500",
  accent: "bg-primary",
};

/**
 * One KPI: label, big number, short note. With `href` the whole card is the link,
 * so the click target is as large as the card (Fitts's law).
 */
export function StatCard({
  label, value, note, href, tone = "neutral", active, testId, icon,
}: { label: string; value: ReactNode; note?: ReactNode; href?: string; tone?: StatTone; active?: boolean; testId?: string; icon?: ReactNode }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm text-gray-500">
          <span className={cn("size-2 rounded-full", TONE[tone])} aria-hidden />
          {label}
        </p>
        {icon && <span className="text-gray-400" aria-hidden>{icon}</span>}
      </div>
      <p className="mt-2 text-2xl leading-none md:text-[28px] font-semibold tracking-tight text-gray-900 tabular-nums">{value}</p>
      {note && <p className="mt-2 text-xs text-gray-500 tabular-nums">{note}</p>}
    </>
  );
  const base = cn(
    "block rounded-xl border border-border bg-card p-4 md:p-5 shadow-[0_1px_2px_0_rgb(16_24_40/0.04)]",
    active && "ring-2 ring-primary",
  );
  return href ? (
    <Link href={href} data-testid={testId} className={cn(base, "transition-[border-color,box-shadow] hover:border-primary/40 hover:shadow-md")}>{body}</Link>
  ) : (
    <div data-testid={testId} className={base}>{body}</div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">{children}</div>;
}
