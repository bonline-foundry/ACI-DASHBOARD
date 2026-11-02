import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { getDb } from "@/db/client";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CHANNEL_COLORS, FALLBACK_COLOR, mainChannel } from "@/lib/channel-colors";
import { formatMillion, formatTaka } from "@/lib/money";
import { formatMonth, isMonth, todayDhaka } from "@/lib/month";
import { cn } from "@/lib/utils";
import { homeData, UPCOMING_DAYS } from "@/server/home";
import type { CampaignView } from "@/server/plan";
import { RemindOverdueButton, ResolveReminderButton } from "./home-actions";

export const metadata: Metadata = { title: "Home" };

type Search = Promise<Record<string, string | string[] | undefined>>;

const LEVEL_BAR = { ok: "bg-teal-600", orange: "bg-orange-500", red: "bg-red-600", "no-budget": "bg-stone-300" } as const;
const LEVEL_TEXT = { ok: "text-stone-700", orange: "text-orange-700", red: "text-red-700", "no-budget": "text-stone-400" } as const;
const longDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default function HomePage({ searchParams }: { searchParams: Search }) {
  return (
    <>
      <PageHeader title="Home" subtitle="What needs attention today · costs with VAT" />
      <Suspense fallback={<p className="text-sm text-stone-500">Loading…</p>}>
        <HomeContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function HomeContent({ searchParams }: { searchParams: Search }) {
  await connection();
  const sp = await searchParams;
  const today = todayDhaka();
  const month = typeof sp.month === "string" && isMonth(sp.month) ? sp.month : today.slice(0, 7);
  const h = await homeData(getDb(), { today, month });
  const t = h.thresholds;
  const buckets = [
    { key: "fresh", label: `0–${t.billYellowDays - 1} days`, ...h.bills.fresh, dot: "bg-stone-400" },
    { key: "yellow", label: `${t.billYellowDays}–${t.billRedDays - 1} days`, ...h.bills.yellow, dot: "bg-amber-500" },
    { key: "red", label: `${t.billRedDays}+ days`, ...h.bills.red, dot: "bg-red-600" },
  ];

  return (
    <div className="space-y-6">
      <form method="get" aria-label="Home month" className="flex flex-wrap items-center gap-2 text-sm text-stone-600">
        <span>Today is {longDate(today)}.</span>
        <label className="flex items-center gap-1">Budget month
          <input type="month" name="month" defaultValue={month} className="h-8 rounded-lg border border-stone-300 bg-white px-2 text-sm" />
        </label>
        <Button type="submit" variant="outline" size="sm">Apply</Button>
      </form>

      <Card className={cn(h.alerts.some((a) => a.level === "red") && "border-red-200")}>
        <CardHeader><CardTitle>Alerts</CardTitle></CardHeader>
        <CardContent>
          {h.alerts.length === 0 ? (
            <p className="text-sm text-stone-500" data-testid="alerts">Nothing needs attention right now.</p>
          ) : (
            <ul className="space-y-2" data-testid="alerts">
              {h.alerts.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", a.level === "red" ? "bg-red-600" : "bg-orange-500")} aria-hidden />
                  <Link href={a.href} className="hover:underline">{a.text}</Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Budget used · {formatMonth(month)}</CardTitle>
            <p className="text-xs text-stone-500">Actual spend against budget. Orange from {t.budgetOrangePct}%, red from {t.budgetRedPct}%.</p>
          </CardHeader>
          <CardContent>
            {h.budgets.length === 0 ? <p className="text-sm text-stone-500">No active brands yet.</p> : (
              <ul className="space-y-3" data-testid="home-budgets">
                {h.budgets.map((b) => (
                  <li key={b.brandId} className="text-sm" data-testid={`home-budget-${b.brandName}`}>
                    <div className="flex justify-between gap-2">
                      <span>{b.brandName}</span>
                      <span className={cn("tabular-nums", LEVEL_TEXT[b.level])}>
                        {b.budget ? `${Math.round(b.pct ?? 0)}% of ${formatMillion(b.budget)}M` : "No budget set"}
                      </span>
                    </div>
                    <div className="mt-1 h-2 rounded bg-stone-100">
                      {b.budget ? <div className={cn("h-2 rounded", LEVEL_BAR[b.level])} style={{ width: `${Math.min(100, b.pct ?? 0)}%` }} /> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Link href={`/plan?month=${month}`} className="mt-3 inline-block text-sm text-teal-700 underline">Open Plan</Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle>Bills waiting</CardTitle>
              <p className="text-xs text-stone-500">{h.bills.unpaid.count} unpaid · {formatTaka(h.bills.unpaid.amount)} BDT</p>
            </div>
            <RemindOverdueButton count={h.bills.red.count} />
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm" data-testid="home-bills">
              {buckets.map((b) => (
                <li key={b.key}>
                  <Link href={`/billing?age=${b.key}`} className="flex items-center justify-between gap-2 hover:underline">
                    <span className="flex items-center gap-2"><span className={cn("size-2 rounded-full", b.dot)} aria-hidden />{b.label}</span>
                    <span className="tabular-nums">{b.count} · {formatMillion(b.amount)}M</span>
                  </Link>
                </li>
              ))}
            </ul>
            {h.reminders.length > 0 && (
              <div className="mt-4 border-t border-stone-100 pt-3">
                <p className="mb-1 text-xs font-medium text-stone-600">Reminders</p>
                <ul className="space-y-1 text-sm" data-testid="home-reminders">
                  {h.reminders.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2">
                      <span>{r.billNo} · {r.vendorName ?? "No vendor"} · <span className="text-stone-500">{r.ageDays} days</span></span>
                      <ResolveReminderButton id={r.id} label={r.billNo} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Best channel for reach</CardTitle></CardHeader>
          <CardContent data-testid="home-best-reach">
            {h.bestReach ? (
              <>
                <p className="text-2xl font-semibold">{h.bestReach.row.name}</p>
                <p className="text-sm text-stone-600">{formatTaka(h.bestReach.row.costPer1000!)} BDT to reach 1,000 people</p>
                <p className="mt-1 text-xs text-stone-500">Lowest cost in {formatMonth(h.bestReach.month)}{h.bestReach.month !== month ? " (latest month with numbers)" : ""}</p>
                <Link href={`/performance?month=${h.bestReach.month}`} className="mt-3 inline-block text-sm text-teal-700 underline">Compare channels</Link>
              </>
            ) : (
              <p className="text-sm text-stone-500">No reach numbers yet. Enter them on the <Link href="/performance" className="underline">Performance</Link> page.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <CampaignList title="Live now" testId="home-live" empty="No campaign is running today." rows={h.live} today={today} />
        <CampaignList title={`Starting in the next ${UPCOMING_DAYS} days`} testId="home-upcoming" empty="Nothing starts in the next two weeks." rows={h.startingSoon} today={today} />
      </div>
    </div>
  );
}

function CampaignList({ title, testId, empty, rows, today }: { title: string; testId: string; empty: string; rows: CampaignView[]; today: string }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? <p className="text-sm text-stone-500" data-testid={testId}>{empty}</p> : (
          <ul className="divide-y divide-stone-100 text-sm" data-testid={testId}>
            {rows.map((c) => {
              const main = mainChannel(c.lines);
              return (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium", main ? CHANNEL_COLORS[main] ?? FALLBACK_COLOR : FALLBACK_COLOR)}>{main ?? "–"}</span>
                    <span className="truncate"><span className="font-medium">{c.name}</span> · {c.brandName}</span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-stone-500 tabular-nums">
                    {c.startDate > today ? `Starts ${longDate(c.startDate)}` : `Ends ${longDate(c.endDate)}`} · {formatMillion(c.total)}M
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <Link href={`/plan?month=${today.slice(0, 7)}`} className="mt-3 inline-block text-sm text-teal-700 underline">Open the plan</Link>
      </CardContent>
    </Card>
  );
}
