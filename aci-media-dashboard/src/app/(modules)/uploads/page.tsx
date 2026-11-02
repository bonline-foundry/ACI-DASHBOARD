import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getDb } from "@/db/client";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/data/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMonth } from "@/lib/month";
import { formatMillion } from "@/lib/money";
import { TEMPLATES } from "@/lib/upload/templates";
import { cn } from "@/lib/utils";
import { listHistory, listUploads } from "@/server/uploads";
import { RestoreButton } from "./restore-button";

export const metadata: Metadata = { title: "Uploads & History" };

type Search = Promise<Record<string, string | string[] | undefined>>;

const ENTITIES = [
  ["", "Everything"], ["upload", "Uploads"], ["campaign", "Campaigns"], ["budget", "Budgets"], ["spend", "Spend entries"],
  ["brand", "Brands"], ["rival", "Rivals"], ["vendor", "Vendors"], ["tv_station", "TV stations"], ["settings", "Settings"],
] as const;

const STATUS = {
  confirmed: { label: "Current", className: "bg-emerald-100 text-emerald-800" },
  superseded: { label: "Older version", className: "bg-stone-100 text-stone-600" },
  rolled_back: { label: "Rolled back", className: "bg-stone-100 text-stone-600" },
};

const when = (s: string) => new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dhaka" });

export default function UploadsPage({ searchParams }: { searchParams: Search }) {
  return (
    <>
      <PageHeader title="Uploads & History" subtitle="Every upload is saved as a version. Every change is logged." />
      <Suspense fallback={<p className="text-sm text-stone-500">Loading…</p>}>
        <UploadsContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function describe(h: { entity: string; action: string; after: unknown; before: unknown }): string {
  const v = (h.after ?? h.before ?? {}) as Record<string, unknown>;
  const name = (v.name ?? v.fileName ?? v.billNo ?? "") as string;
  if (h.entity === "upload") {
    const periods = Array.isArray(v.periods) ? (v.periods as string[]).map(formatMonth).join(", ") : "";
    return `${name} · ${periods} · ${v.inserted ?? 0} rows saved${v.skippedManual ? `, ${v.skippedManual} manual kept` : ""}`;
  }
  if (h.entity === "budget") return `Budget ${typeof v.amount === "number" ? formatMillion(v.amount) + "M" : ""} for ${v.month ?? ""}`;
  if (h.entity === "spend") return `${typeof v.amount === "number" ? formatMillion(v.amount) + "M" : ""} in ${v.month ?? ""}`;
  return name;
}

async function UploadsContent({ searchParams }: { searchParams: Search }) {
  await connection();
  const sp = await searchParams;
  const entity = typeof sp.entity === "string" && ENTITIES.some(([k]) => k === sp.entity) ? sp.entity : "";
  const db = getDb();
  const [ups, history] = await Promise.all([listUploads(db), listHistory(db, { entity: entity || undefined, limit: 200 })]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Upload versions</CardTitle></CardHeader>
        <CardContent>
          {ups.length === 0 ? (
            <EmptyState title="No uploads yet" message="Files uploaded on the Plan, Spend and other pages appear here as versions." />
          ) : (
            <div className="overflow-x-auto">
              <Table data-testid="uploads-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Version</TableHead><TableHead>Type</TableHead><TableHead>File</TableHead><TableHead>Months</TableHead>
                    <TableHead className="text-right">Rows</TableHead><TableHead className="text-right">Total (M)</TableHead>
                    <TableHead>Uploaded</TableHead><TableHead>Status</TableHead><TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ups.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>{u.id}</TableCell>
                      <TableCell>{TEMPLATES[u.kind].title}</TableCell>
                      <TableCell className="max-w-48 truncate">{u.fileName}</TableCell>
                      <TableCell>{u.periods.map(formatMonth).join(", ")}</TableCell>
                      <TableCell className="text-right tabular-nums">{u.rowCount}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMillion(u.rowsTotal)}
                        {u.controlTotal !== null && Math.abs(u.controlTotal - u.rowsTotal) >= 1 && (
                          <span className="ml-1 text-xs text-amber-700" title={`TOTAL row said ${formatMillion(u.controlTotal)}M`}>≠ {formatMillion(u.controlTotal)}</span>
                        )}
                      </TableCell>
                      <TableCell>{when(u.createdAt)}</TableCell>
                      <TableCell><span className={cn("rounded-full px-2 py-0.5 text-xs", STATUS[u.status].className)}>{STATUS[u.status].label}</span></TableCell>
                      <TableCell>{u.status !== "confirmed" && <RestoreButton id={u.id} kind={u.kind} />}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>History log</CardTitle>
          <form method="get" className="flex items-center gap-2">
            <select name="entity" defaultValue={entity} aria-label="Show changes to" className="h-8 rounded-lg border border-stone-300 bg-white px-2 text-sm">
              {ENTITIES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
            <Button type="submit" size="sm" variant="outline">Filter</Button>
          </form>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-stone-500">No changes yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table data-testid="history-table">
                <TableHeader>
                  <TableRow><TableHead>When</TableHead><TableHead>Who</TableHead><TableHead>What</TableHead><TableHead>Action</TableHead><TableHead>Details</TableHead><TableHead>Reason</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="whitespace-nowrap">{when(h.at)}</TableCell>
                      <TableCell>{h.actor}</TableCell>
                      <TableCell className="capitalize">{h.entity.replace("_", " ")}</TableCell>
                      <TableCell className="capitalize">{h.action}</TableCell>
                      <TableCell className="max-w-md truncate">{describe(h)}</TableCell>
                      <TableCell>{h.reason ?? ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="mt-2 text-xs text-stone-500">Showing the latest 200 changes.</p>
        </CardContent>
      </Card>
    </div>
  );
}
