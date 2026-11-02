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
import { formatCount, formatTaka, parseAmount } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { PerformanceView } from "@/server/performance";
import { savePerformanceAction } from "./actions";

type Option = { id: number; name: string };
type Channel = Option & { code: string };

const TV_INPUTS = [
  { key: "grp", label: "GRP" },
  { key: "shareOfVoice", label: "Share of voice %" },
  { key: "shareOfSpend", label: "Share of spend %" },
  { key: "reach1Plus", label: "1+ reach %" },
  { key: "cprp", label: "Cost per rating point" },
] as const;

type RowState = { spend: string; peopleReached: string } & Record<(typeof TV_INPUTS)[number]["key"], string>;

const selectClass = "h-8 rounded-lg border border-stone-300 bg-white px-2 text-sm";
const text = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));

export function PerformanceResults({
  month, rows, brands, channels, brandId,
}: { month: string; rows: PerformanceView[]; brands: Option[]; channels: Channel[]; brandId?: number }) {
  const [open, setOpen] = useState(false);
  const [startBrand, setStartBrand] = useState<number | undefined>(brandId);
  const enter = (b?: number) => {
    setStartBrand(b ?? brandId ?? brands[0]?.id);
    setOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Results for {formatMonth(month)}</CardTitle>
        <Button onClick={() => enter()} disabled={brands.length === 0}>Enter results</Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState title="No results this month" message="Enter spend and people reached for each channel, or upload the performance file below." />
        ) : (
          <div className="overflow-x-auto">
            <Table data-testid="performance-entries">
              <TableHeader>
                <TableRow>
                  <TableHead>Brand</TableHead><TableHead>Channel</TableHead><TableHead className="text-right">Spend (BDT)</TableHead>
                  <TableHead className="text-right">People reached</TableHead><TableHead className="text-right">Cost per 1,000 (BDT)</TableHead>
                  <TableHead>Source</TableHead><TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.brandName}</TableCell>
                    <TableCell>{r.channelName}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatTaka(r.spend)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.peopleReached === null ? "–" : formatCount(r.peopleReached)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.costPer1000 === null ? "No data" : formatTaka(r.costPer1000)}</TableCell>
                    <TableCell>
                      <span className={cn("rounded-full px-2 py-0.5 text-xs", r.source === "manual" ? "bg-violet-100 text-violet-800" : "bg-stone-100 text-stone-700")}>
                        {r.source === "manual" ? "Manual edit" : "Uploaded"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => enter(r.brandId)}>Edit</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="mt-2 text-xs text-stone-500">Saving the form turns a brand&apos;s rows into manual edits. Manual edits are kept when the month is uploaded again.</p>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          {open && <ResultsForm month={month} rows={rows} brands={brands} channels={channels} initialBrand={startBrand} onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function stateFor(rows: PerformanceView[], brandId: number | undefined, channels: Channel[]): Record<number, RowState> {
  return Object.fromEntries(channels.map((c) => {
    const r = rows.find((x) => x.brandId === brandId && x.channelId === c.id);
    return [c.id, {
      spend: text(r?.spend), peopleReached: text(r?.peopleReached),
      ...Object.fromEntries(TV_INPUTS.map((t) => [t.key, text(r?.[t.key])])),
    } as RowState];
  }));
}

function ResultsForm({
  month, rows, brands, channels, initialBrand, onDone,
}: { month: string; rows: PerformanceView[]; brands: Option[]; channels: Channel[]; initialBrand?: number; onDone: () => void }) {
  const [brandId, setBrandId] = useState(initialBrand ?? brands[0]?.id);
  const [grid, setGrid] = useState(() => stateFor(rows, brandId, channels));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const tv = channels.find((c) => c.code === "TV");

  const changeBrand = (id: number) => {
    setBrandId(id);
    setGrid(stateFor(rows, id, channels));
  };
  const set = (channelId: number, key: keyof RowState) => (e: { target: { value: string } }) =>
    setGrid((g) => ({ ...g, [channelId]: { ...g[channelId], [key]: e.target.value } }));

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await savePerformanceAction({
        brandId: Number(brandId), month,
        rows: channels.map((c) => {
          const s = grid[c.id];
          const tvValues = c.code === "TV" ? Object.fromEntries(TV_INPUTS.map((t) => [t.key, parseAmount(s[t.key])])) : {};
          return { channelId: c.id, spend: parseAmount(s.spend), peopleReached: parseAmount(s.peopleReached), ...tvValues };
        }),
      });
      if (res.error) return setError(res.error);
      toast.success("Results saved");
      onDone();
    });
  }

  return (
    <>
      <DialogHeader><DialogTitle>Results for {formatMonth(month)}</DialogTitle></DialogHeader>
      <label className="flex items-center gap-2 text-sm">Brand
        <select aria-label="Results brand" className={selectClass} value={brandId} onChange={(e) => changeBrand(Number(e.target.value))}>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
      <div className="max-h-[50vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-stone-500">
              <th className="py-1 font-normal">Channel</th>
              <th className="py-1 font-normal">Spend (BDT, with VAT)</th>
              <th className="py-1 font-normal">People reached</th>
            </tr>
          </thead>
          <tbody>
            {channels.map((c) => (
              <tr key={c.id}>
                <td className="py-1 pr-2">{c.name}</td>
                <td className="py-1 pr-2"><Input aria-label={`${c.name} spend`} inputMode="numeric" value={grid[c.id].spend} onChange={set(c.id, "spend")} /></td>
                <td className="py-1"><Input aria-label={`${c.name} people reached`} inputMode="numeric" value={grid[c.id].peopleReached} onChange={set(c.id, "peopleReached")} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {tv && (
        <fieldset className="rounded-lg border border-stone-200 p-3">
          <legend className="px-1 text-sm text-stone-600">TV numbers (optional)</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {TV_INPUTS.map((t) => (
              <label key={t.key} className="flex flex-col gap-1 text-sm">{t.label}
                <Input aria-label={`TV ${t.label}`} inputMode="decimal" value={grid[tv.id][t.key]} onChange={set(tv.id, t.key)} />
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <p className="text-xs text-stone-500">Leave a channel blank to remove it for this month.</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <DialogFooter>
        <Button onClick={save} disabled={pending}>{pending ? "Saving…" : "Save results"}</Button>
      </DialogFooter>
    </>
  );
}
