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
import type { CompetitorMediaView } from "@/server/competitors";
import { deleteMediaAction, saveMediaAction } from "./actions";

export type Subject = { rivalId: number | null; name: string };

const MEDIA = ["TV", "Press", "Radio"] as const;
const selectClass = "h-9 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm";
const subjectValue = (rivalId: number | null) => (rivalId === null ? "own" : String(rivalId));

export function MediaEntries({ brandId, month, rows, subjects }: { brandId: number; month: string; rows: CompetitorMediaView[]; subjects: Subject[] }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CompetitorMediaView | null>(null);
  const [pending, startTransition] = useTransition();
  const edit = (r: CompetitorMediaView | null) => {
    setEditing(r);
    setOpen(true);
  };
  const remove = (r: CompetitorMediaView) => {
    if (!confirm(`Delete ${r.media} for ${r.subjectName}?`)) return;
    startTransition(async () => {
      const res = await deleteMediaAction(r.id);
      if (res.error) toast.error(res.error);
      else toast.success("Row deleted");
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>TV, Press and Radio rows · {formatMonth(month)}</CardTitle>
        <Button onClick={() => edit(null)}>Add row</Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState title="No rows this month" message="Add spend and spots for the brand and its rivals, or upload the competitor file below." />
        ) : (
          <div className="overflow-x-auto">
            <Table data-testid="competitor-media-entries">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead><TableHead>Media</TableHead><TableHead className="text-right">Spend (BDT)</TableHead>
                  <TableHead className="text-right">Spots</TableHead><TableHead className="text-right">Reported share of voice</TableHead>
                  <TableHead>Source</TableHead><TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className={cn(r.isOwn && "font-medium")}>{r.subjectName}</TableCell>
                    <TableCell>{r.media}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.spend === null ? "–" : formatTaka(r.spend)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.spots === null ? "–" : formatCount(r.spots)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.shareOfVoice === null ? "–" : `${r.shareOfVoice}%`}</TableCell>
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
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          {open && <MediaForm key={editing?.id ?? "new"} entry={editing} brandId={brandId} month={month} subjects={subjects} onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function MediaForm({ entry, brandId, month, subjects, onDone }: { entry: CompetitorMediaView | null; brandId: number; month: string; subjects: Subject[]; onDone: () => void }) {
  const [f, setF] = useState({
    subject: entry ? subjectValue(entry.rivalId) : subjectValue(subjects[1]?.rivalId ?? null),
    media: entry?.media ?? "TV",
    spend: entry?.spend == null ? "" : String(entry.spend),
    spots: entry?.spots == null ? "" : String(entry.spots),
    shareOfVoice: entry?.shareOfVoice == null ? "" : String(entry.shareOfVoice),
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await saveMediaAction(entry?.id ?? null, {
        brandId, month: entry?.month ?? month, rivalId: f.subject === "own" ? null : Number(f.subject), media: f.media,
        spend: parseAmount(f.spend), spots: parseAmount(f.spots), shareOfVoice: parseAmount(f.shareOfVoice),
      });
      if (res.error) return setError(res.error);
      toast.success(entry ? "Row updated" : "Row added");
      onDone();
    });
  }

  return (
    <>
      <DialogHeader><DialogTitle>{entry ? "Edit row" : "Add row"} · {formatMonth(entry?.month ?? month)}</DialogTitle></DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">Brand or rival
          <select aria-label="Media name" className={selectClass} value={f.subject} onChange={set("subject")}>
            {subjects.map((s) => <option key={subjectValue(s.rivalId)} value={subjectValue(s.rivalId)}>{s.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">Media
          <select aria-label="Media type" className={selectClass} value={f.media} onChange={set("media")}>
            {MEDIA.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">Spend (BDT)
          <Input aria-label="Media spend" inputMode="numeric" value={f.spend} onChange={set("spend")} />
        </label>
        <label className="flex flex-col gap-1">Spots or insertions
          <Input aria-label="Media spots" inputMode="numeric" value={f.spots} onChange={set("spots")} />
        </label>
        <label className="flex flex-col gap-1">Reported share of voice % (optional)
          <Input aria-label="Media share of voice" inputMode="decimal" value={f.shareOfVoice} onChange={set("shareOfVoice")} />
        </label>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <DialogFooter>
        <Button onClick={save} disabled={pending}>{pending ? "Saving…" : "Save row"}</Button>
      </DialogFooter>
    </>
  );
}
