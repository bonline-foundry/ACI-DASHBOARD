import type { Metadata } from "next";
import { Suspense } from "react";
import { Download, Search } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { getDb } from "@/db/client";
import { PageHeader } from "@/components/shell/page-header";
import { UploadPanel } from "@/components/data/upload-panel";
import { StatCard, StatGrid, type StatTone } from "@/components/data/stat-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BILL_STATUSES, BILL_STATUS_LABELS } from "@/lib/bill-status";
import { formatMillion, formatTaka } from "@/lib/money";
import { cn } from "@/lib/utils";
import { todayDhaka } from "@/lib/month";
import { billSummary, listBills, type AgeFilter } from "@/server/billing";
import { parseBillFilter } from "@/server/filters";
import { getThresholds, listBrandsWithRivals, listVendors } from "@/server/master-data";
import { BillsTable } from "./bills-table";
import { PageSkeleton } from "@/components/data/page-skeleton";

export const metadata: Metadata = { title: "Billing" };

type Search = Promise<Record<string, string | string[] | undefined>>;

const selectClass = "h-9 rounded-full border border-gray-200 bg-white px-3 text-sm shadow-xs";

export default function BillingPage({ searchParams }: { searchParams: Search }) {
  return (
    <>
      <PageHeader title="Billing" subtitle="Unpaid media bills, payment status and reminders" />
      <Suspense fallback={<PageSkeleton label="Loading bills" />}>
        <BillingContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function BillingContent({ searchParams }: { searchParams: Search }) {
  await connection();
  const sp = await searchParams;
  const today = todayDhaka();
  const filter = parseBillFilter(sp);
  const exportQuery = new URLSearchParams(Object.entries({ q: filter.search, status: filter.status, brand: filter.brandId?.toString(), age: filter.age })
    .filter((e): e is [string, string] => Boolean(e[1]))).toString();
  const filtered = Object.values(filter).some((v) => v !== undefined && v !== "");

  const db = getDb();
  const [t, summary, rows, allRed, brands, vendors] = await Promise.all([
    getThresholds(db), billSummary(db, today), listBills(db, today, filter), listBills(db, today, { age: "red" }),
    listBrandsWithRivals(db), listVendors(db),
  ]);
  const counters: { age: AgeFilter; label: string; count: number; amount: number; tone: StatTone }[] = [
    { age: "fresh", label: `0–${t.billYellowDays - 1} days`, ...summary.fresh, tone: "neutral" },
    { age: "yellow", label: `${t.billYellowDays}–${t.billRedDays - 1} days`, ...summary.yellow, tone: "warn" },
    { age: "red", label: `${t.billRedDays}+ days`, ...summary.red, tone: "bad" },
    { age: "paid", label: "Paid this month", ...summary.paidThisMonth, tone: "good" },
  ];

  return (
    <div className="space-y-6">
      <div data-testid="bill-counters">
        <StatGrid>
          {counters.map((c) => (
            <StatCard key={c.age} href={`/billing?age=${c.age}`} testId={`counter-${c.age}`} label={c.label} value={c.count}
              note={`${formatMillion(c.amount)}M BDT`} tone={c.tone} active={filter.age === c.age} />
          ))}
        </StatGrid>
      </div>

      {allRed.length > 0 && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle>Check these bills</CardTitle>
            <p className="text-xs text-gray-500">Unpaid for {t.billRedDays} days or more. Follow up with the vendor or finance.</p>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-gray-100 text-sm" data-testid="check-these-bills">
              {allRed.slice(0, 8).map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span><span className="font-medium">{b.billNo}</span> · {b.vendorName ?? "No vendor"}{b.brandName ? ` · ${b.brandName}` : ""}</span>
                  <span className="tabular-nums">{formatTaka(b.amount)} BDT · <span className="text-red-700">{b.ageDays} days</span></span>
                </li>
              ))}
            </ul>
            {allRed.length > 8 && <Link href="/billing?age=red" className="mt-2 inline-block text-sm text-primary underline">See all {allRed.length}</Link>}
          </CardContent>
        </Card>
      )}


      <BillsTable autoOpen={sp.new === "bill"} rows={rows}
        toolbar={
<form method="get" aria-label="Bill filters" className="flex flex-wrap items-center gap-2">
              <label className="flex h-9 w-full items-center gap-2 rounded-full border border-gray-200 bg-white px-3 text-gray-400 shadow-xs focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 sm:w-72">
                <Search className="size-4" aria-hidden />
                <input name="q" defaultValue={filter.search ?? ""} placeholder="Search bill no, PO, vendor, note" aria-label="Search bills"
                  className="h-8 min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400" />
              </label>
              <select name="status" aria-label="Status" defaultValue={filter.status ?? ""} className={selectClass}>
                <option value="">Any status</option>
                {BILL_STATUSES.map((s) => <option key={s} value={s}>{BILL_STATUS_LABELS[s]}</option>)}
              </select>
              <select name="brand" aria-label="Brand" defaultValue={filter.brandId ? String(filter.brandId) : ""} className={selectClass}>
                <option value="">All brands</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <select name="age" aria-label="Age" defaultValue={filter.age ?? ""} className={selectClass}>
                <option value="">Any age</option>
                <option value="fresh">0–{t.billYellowDays - 1} days</option>
                <option value="yellow">{t.billYellowDays}–{t.billRedDays - 1} days</option>
                <option value="red">{t.billRedDays}+ days</option>
                <option value="paid">Paid</option>
              </select>
              <Button type="submit" variant="outline">Apply</Button>
              {filtered && <Link href="/billing" className="text-sm text-gray-600 underline">Clear</Link>}
              <a href={`/api/export/bills?${exportQuery}`} download className={cn(buttonVariants({ variant: "secondary" }), "ml-auto")}><Download aria-hidden />Export to Excel</a>
            </form>
        }
        unpaidNote={`${summary.unpaid.count} unpaid · ${formatTaka(summary.unpaid.amount)} BDT with VAT`} filtered={filtered} month={today.slice(0, 7)}
        vendors={vendors.map((v) => ({ id: v.id, name: v.name }))} brands={brands.map((b) => ({ id: b.id, name: b.name }))} />

      <UploadPanel kind="bills" />
    </div>
  );
}
