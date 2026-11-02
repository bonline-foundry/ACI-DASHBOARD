import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { getDb } from "@/db/client";
import { PageHeader } from "@/components/shell/page-header";
import { FilterBar } from "@/components/data/filter-bar";
import { buttonVariants } from "@/components/ui/button";
import { addMonths, formatMonth, isMonth, monthBounds, todayDhaka } from "@/lib/month";
import { cn } from "@/lib/utils";
import { listBrandsWithRivals } from "@/server/master-data";
import { listCampaigns, listChannels, planVsBudget } from "@/server/plan";
import { PlanBoard, type PlanView } from "./plan-board";
import { BudgetPanel } from "./budget-panel";
import { UploadPanel } from "@/components/data/upload-panel";

export const metadata: Metadata = { title: "Plan" };

type Search = Promise<Record<string, string | string[] | undefined>>;

const VIEWS: { key: PlanView; label: string }[] = [
  { key: "timeline", label: "Timeline" },
  { key: "calendar", label: "Calendar" },
  { key: "list", label: "List" },
];

export default function PlanPage({ searchParams }: { searchParams: Search }) {
  return (
    <>
      <PageHeader title="Plan" subtitle="Campaigns by date, with budget against plan and actual spend" />
      <Suspense fallback={<p className="text-sm text-stone-500">Loading plan…</p>}>
        <PlanContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function PlanContent({ searchParams }: { searchParams: Search }) {
  await connection();
  const sp = await searchParams;
  const today = todayDhaka();
  const month = typeof sp.month === "string" && isMonth(sp.month) ? sp.month : today.slice(0, 7);
  const view: PlanView = VIEWS.some((v) => v.key === sp.view) ? (sp.view as PlanView) : "timeline";
  const brandId = typeof sp.brand === "string" && /^\d+$/.test(sp.brand) ? Number(sp.brand) : undefined;

  const db = getDb();
  const { start, end } = monthBounds(month);
  const [allBrands, channels, campaigns, budgetRows] = await Promise.all([
    listBrandsWithRivals(db),
    listChannels(db),
    listCampaigns(db, { from: start, to: end, brandId }),
    planVsBudget(db, month, brandId),
  ]);
  const activeBrands = allBrands.filter((b) => b.active).map((b) => ({ id: b.id, name: b.name }));
  const shownBrands = brandId ? activeBrands.filter((b) => b.id === brandId) : activeBrands;

  const href = (patch: Record<string, string>) => {
    const q = new URLSearchParams({ month, view, ...(brandId ? { brand: String(brandId) } : {}), ...patch });
    return `/plan?${q.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={href({ month: addMonths(month, -1) })} className={buttonVariants({ variant: "outline", size: "sm" })} aria-label="Previous month">‹</Link>
          <h2 className="min-w-36 text-center text-lg font-semibold">{formatMonth(month)}</h2>
          <Link href={href({ month: addMonths(month, 1) })} className={buttonVariants({ variant: "outline", size: "sm" })} aria-label="Next month">›</Link>
        </div>
        <nav aria-label="Plan views" className="flex gap-1 rounded-lg bg-stone-200/60 p-1">
          {VIEWS.map((v) => (
            <Link key={v.key} href={href({ view: v.key })} aria-current={view === v.key ? "page" : undefined}
              className={cn("rounded-md px-3 py-1 text-sm", view === v.key ? "bg-white font-medium shadow-sm" : "text-stone-600")}>
              {v.label}
            </Link>
          ))}
        </nav>
        <FilterBar month={month} brands={activeBrands} brandId={brandId} keep={{ view }} />
      </div>

      <PlanBoard
        view={view}
        month={month}
        today={today}
        brands={shownBrands}
        channels={channels.map((c) => ({ id: c.id, name: c.name }))}
        campaigns={campaigns}
        brandId={brandId}
      />

      {shownBrands.length > 0 && <BudgetPanel month={month} rows={budgetRows} />}

      <UploadPanel kind="plan" />
    </div>
  );
}
