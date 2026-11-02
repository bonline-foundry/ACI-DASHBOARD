"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/data/empty-state";
import { formatMonth } from "@/lib/month";
import { formatCount, formatRate, formatTaka, parseAmount } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { DigitalView } from "@/server/digital";
import { deleteDigitalAction, saveDigitalAction } from "./actions";

type Option = { id: number; name: string };

const FIELDS = [
  { key: "spend", label: "Spend (BDT, with VAT)", aria: "Digital spend" },
  { key: "reach", label: "Reach", aria: "Digital reach" },
  { key: "impressions", label: "Impressions", aria: "Digital impressions" },
  { key: "cpm", label: "CPM (BDT)", aria: "Digital CPM" },
  { key: "thruplays", label: "ThruPlays", aria: "Digital ThruPlays" },
  { key: "costPerView", label: "Cost per view (BDT)", aria: "Digital cost per view" },
  { key: "engagement", label: "Post engagement", aria: "Digital engagement" },
] as const;
type FieldKey = (typeof FIELDS)[number]["key"];

const selectClass = "h-9 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm";
const count = (v: number | null) => (v === null ? "–" : formatCount(v));
const derived = (v: number | null, isDerived: boolean) =>
  v === null ? "–" : <span title={isDerived ? "Worked out from spend" : undefined}>{formatRate(v)}{isDerived && <span className="text-gray-400">*</span>}</span>;

export function DigitalEntries({
  month, rows, brands, platforms, brandId,
}: { month: string; rows: DigitalView[]; brands: Option[]; platforms: Option[]; brandId?: number }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DigitalView | null>(null);
  const [pending, startTransition] = useTransition();
  const edit = (r: DigitalView | null) => {
    setEditing(r);
    setOpen(true);
  };
  const remove = (r: DigitalView) => {
    if (!confirm(`Delete ${r.platformName} results for ${r.brandName}?`)) return;
    startTransition(async () => {
      const res = await deleteDigitalAction(r.id);
      if (res.error) toast.error(res.error);
      else toast.success("Results deleted");
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Results for {formatMonth(month)}</CardTitle>
        <Button onClick={() => edit(null)} disabled={brands.length === 0}>Add results</Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState title="No digital results this month" message="Add Meta, YouTube or TikTok numbers by hand, or upload the digital file below." />
        ) : (
          <div className="overflow-x-auto">
            <Table data-testid="digital-entries">
              <TableHeader>
                <TableRow>
                  <TableHead>Brand</TableHead><TableHead>Platform</TableHead><TableHead className="text-right">Spend (BDT)</TableHead>
                  <TableHead className="text-right">Reach</TableHead><TableHead className="text-right">Impressions</TableHead>
                  <TableHead className="text-right">CPM</TableHead><TableHead className="text-right">ThruPlays</TableHead>
                  <TableHead className="text-right">Cost per view</TableHead><TableHead className="text-right">Engagement</TableHead>
                  <TableHead>Source</TableHead><TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.brandName}</TableCell>
                    <TableCell>{r.platformName}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.spend === null ? "–" : formatTaka(r.spend)}</TableCell>
                    <TableCell className="text-right tabular-nums">{count(r.reach)}</TableCell>
                    <TableCell className="text-right tabular-nums">{count(r.impressions)}</TableCell>
                    <TableCell className="text-right tabular-nums">{derived(r.cpm, r.cpmDerived)}</TableCell>
                    <TableCell className="text-right tabular-nums">{count(r.thruplays)}</TableCell>
                    <TableCell className="text-right tabular-nums">{derived(r.costPerView, r.costPerViewDerived)}</TableCell>
                    <TableCell className="text-right tabular-nums">{count(r.engagement)}</TableCell>
                    <TableCell>
                      <span className={cn("rounded-full px-2 py-0.5 text-xs", r.source === "manual" ? "bg-violet-100 text-violet-800" : "bg-gray-100 text-gray-700")}>
                        {r.source === "manual" ? "Manual edit" : "Uploaded"}
                      </span>
                    </TableCell>
                    <TableCell className="space-x-1 text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => edit(r)}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(r)} disabled={pending}>Delete</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="mt-2 text-xs text-gray-500">* Worked out from spend when left blank. Editing an uploaded row turns it into a manual edit.</p>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          {open && (
            <EntryForm key={editing?.id ?? "new"} entry={editing} month={month} brands={brands} platforms={platforms}
              brandId={brandId} onDone={() => setOpen(false)} />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function EntryForm({
  entry, month, brands, platforms, brandId, onDone,
}: { entry: DigitalView | null; month: string; brands: Option[]; platforms: Option[]; brandId?: number; onDone: () => void }) {
  // Derived CPM / cost per view are display-only, so the form starts from what was stored.
  const stored = (k: FieldKey): string => {
    if (!entry) return "";
    if (k === "cpm" && entry.cpmDerived) return "";
    if (k === "costPerView" && entry.costPerViewDerived) return "";
    const v = entry[k];
    return v === null ? "" : String(v);
  };
  const [f, setF] = useState({
    brandId: String(entry?.brandId ?? brandId ?? brands[0]?.id ?? ""),
    month: entry?.month ?? month,
    platformId: String(entry?.platformId ?? platforms[0]?.id ?? ""),
    ...(Object.fromEntries(FIELDS.map((x) => [x.key, stored(x.key)])) as Record<FieldKey, string>),
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await saveDigitalAction(entry?.id ?? null, {
        brandId: Number(f.brandId), month: f.month, platformId: Number(f.platformId),
        ...Object.fromEntries(FIELDS.map((x) => [x.key, parseAmount(f[x.key])])),
      });
      if (res.error) return setError(res.error);
      toast.success(entry ? "Results updated" : "Results added");
      onDone();
    });
  }

  return (
    <>
      <DialogHeader><DialogTitle>{entry ? "Edit digital results" : "Add digital results"}</DialogTitle></DialogHeader>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">Brand
          <select aria-label="Digital brand" className={selectClass} value={f.brandId} onChange={set("brandId")}>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">Month
          <Input aria-label="Digital month" type="month" value={f.month} onChange={set("month")} />
        </label>
        <label className="flex flex-col gap-1">Platform
          <select aria-label="Digital platform" className={selectClass} value={f.platformId} onChange={set("platformId")}>
            {platforms.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((x) => (
          <label key={x.key} className="flex flex-col gap-1">{x.label}
            <Input aria-label={x.aria} inputMode="decimal" value={f[x.key]} onChange={set(x.key)} />
          </label>
        ))}
      </div>
      <p className="text-xs text-gray-500">Leave CPM or cost per view blank to work it out from spend.</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <DialogFooter>
        <Button onClick={save} disabled={pending}>{pending ? "Saving…" : "Save results"}</Button>
      </DialogFooter>
    </>
  );
}
