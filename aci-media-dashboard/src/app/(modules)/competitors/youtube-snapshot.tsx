"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMonth } from "@/lib/month";
import { formatCount, parseAmount } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { YoutubeView } from "@/server/competitors";
import { saveYoutubeAction } from "./actions";

const NUMBERS = [
  { key: "subscribers", label: "Subscribers" },
  { key: "totalViews", label: "Total views" },
  { key: "videos", label: "Videos" },
] as const;
type RowState = Record<(typeof NUMBERS)[number]["key"] | "latestUploadOn", string>;

const count = (v: number | null) => (v === null ? "–" : formatCount(v));

export function YoutubeSnapshot({ brandId, month, rows }: { brandId: number; month: string; rows: YoutubeView[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>YouTube snapshot · {formatMonth(month)}</CardTitle>
        <Button onClick={() => setOpen(true)}>Update snapshot</Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table data-testid="youtube-snapshot">
            <TableHeader>
              <TableRow>
                <TableHead>Channel</TableHead><TableHead className="text-right">Subscribers</TableHead>
                <TableHead className="text-right">Change since last month</TableHead><TableHead className="text-right">Total views</TableHead>
                <TableHead className="text-right">Videos</TableHead><TableHead>Latest upload</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className={cn(r.isOwn && "font-medium")}>{r.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{count(r.subscribers)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", r.subscriberChange !== null && (r.subscriberChange >= 0 ? "text-emerald-700" : "text-red-700"))}>
                    {r.subscriberChange === null ? "–" : `${r.subscriberChange >= 0 ? "+" : "−"}${formatCount(Math.abs(r.subscriberChange))}`}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{count(r.totalViews)}</TableCell>
                  <TableCell className="text-right tabular-nums">{count(r.videos)}</TableCell>
                  <TableCell>{r.latestUploadOn ?? "–"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="mt-2 text-xs text-gray-500">Take the numbers from each channel page once a month.</p>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          {open && <SnapshotForm brandId={brandId} month={month} rows={rows} onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function SnapshotForm({ brandId, month, rows, onDone }: { brandId: number; month: string; rows: YoutubeView[]; onDone: () => void }) {
  const [grid, setGrid] = useState<Record<string, RowState>>(() => Object.fromEntries(rows.map((r) => [r.key, {
    subscribers: r.subscribers === null ? "" : String(r.subscribers),
    totalViews: r.totalViews === null ? "" : String(r.totalViews),
    videos: r.videos === null ? "" : String(r.videos),
    latestUploadOn: r.latestUploadOn ?? "",
  }])));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (key: string, field: keyof RowState) => (e: { target: { value: string } }) =>
    setGrid((g) => ({ ...g, [key]: { ...g[key], [field]: e.target.value } }));

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await saveYoutubeAction({
        brandId, month,
        rows: rows.map((r) => {
          const s = grid[r.key];
          return {
            rivalId: r.rivalId, subscribers: parseAmount(s.subscribers), totalViews: parseAmount(s.totalViews),
            videos: parseAmount(s.videos), latestUploadOn: s.latestUploadOn || null,
          };
        }),
      });
      if (res.error) return setError(res.error);
      toast.success("Snapshot saved");
      onDone();
    });
  }

  return (
    <>
      <DialogHeader><DialogTitle>YouTube snapshot · {formatMonth(month)}</DialogTitle></DialogHeader>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="py-1 font-normal">Channel</th>
              {NUMBERS.map((n) => <th key={n.key} className="py-1 font-normal">{n.label}</th>)}
              <th className="py-1 font-normal">Latest upload</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="py-1 pr-2">{r.name}</td>
                {NUMBERS.map((n) => (
                  <td key={n.key} className="py-1 pr-2">
                    <Input aria-label={`${r.name} ${n.label.toLowerCase()}`} inputMode="numeric" value={grid[r.key][n.key]} onChange={set(r.key, n.key)} />
                  </td>
                ))}
                <td className="py-1">
                  <Input aria-label={`${r.name} latest upload`} type="date" value={grid[r.key].latestUploadOn} onChange={set(r.key, "latestUploadOn")} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500">Leave a row blank to remove it for this month.</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <DialogFooter>
        <Button onClick={save} disabled={pending}>{pending ? "Saving…" : "Save snapshot"}</Button>
      </DialogFooter>
    </>
  );
}
