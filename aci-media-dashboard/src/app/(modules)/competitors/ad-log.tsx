"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/data/empty-state";
import { cn } from "@/lib/utils";
import type { CompetitorAdView } from "@/server/competitors";
import { deleteAdAction, saveAdAction } from "./actions";

type Rival = { id: number; name: string };

const PLATFORMS = ["Meta", "TikTok"] as const;
const TEXT_FIELDS = [
  { key: "hook", label: "Hook (first line or opening shot)" },
  { key: "cta", label: "Call to action" },
  { key: "visualStyle", label: "Visual style" },
  { key: "tone", label: "Tone" },
] as const;
const selectClass = "h-8 w-full rounded-lg border border-stone-300 bg-white px-2 text-sm";

export function AdLog({ brandId, rows, rivals }: { brandId: number; rows: CompetitorAdView[]; rivals: Rival[] }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CompetitorAdView | null>(null);
  const [platform, setPlatform] = useState<"" | (typeof PLATFORMS)[number]>("");
  const [pending, startTransition] = useTransition();
  const shown = platform ? rows.filter((r) => r.platform === platform) : rows;
  const edit = (r: CompetitorAdView | null) => {
    setEditing(r);
    setOpen(true);
  };
  const remove = (r: CompetitorAdView) => {
    if (!confirm(`Delete this ${r.platform} ad from ${r.rivalName}?`)) return;
    startTransition(async () => {
      const res = await deleteAdAction(r.id);
      if (res.error) toast.error(res.error);
      else toast.success("Ad deleted");
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Meta and TikTok ad log</CardTitle>
        <div className="flex items-center gap-2">
          <div role="group" aria-label="Ad platform" className="flex gap-1 rounded-lg bg-stone-200/60 p-1">
            {(["", ...PLATFORMS] as const).map((p) => (
              <button key={p || "all"} type="button" aria-pressed={platform === p} onClick={() => setPlatform(p)}
                className={cn("rounded-md px-3 py-1 text-sm", platform === p ? "bg-white font-medium shadow-sm" : "text-stone-600")}>
                {p || "All"}
              </button>
            ))}
          </div>
          <Button onClick={() => edit(null)} disabled={rivals.length === 0}>Add ad</Button>
        </div>
      </CardHeader>
      <CardContent>
        {rivals.length === 0 ? (
          <EmptyState title="No rivals yet" message="Add up to 3 rivals for this brand in Settings to start the ad log." />
        ) : shown.length === 0 ? (
          <EmptyState title="No ads logged" message="Log a rival's Meta or TikTok ad with its link, hook, call to action, style and tone." />
        ) : (
          <div className="overflow-x-auto">
            <Table data-testid="ad-log">
              <TableHeader>
                <TableRow>
                  <TableHead>Rival</TableHead><TableHead>Platform</TableHead><TableHead>Started</TableHead><TableHead>Hook</TableHead>
                  <TableHead>Call to action</TableHead><TableHead>Style · tone</TableHead><TableHead>Link</TableHead><TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.rivalName}</TableCell>
                    <TableCell>{r.platform}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.startedOn ?? "–"}</TableCell>
                    <TableCell className="max-w-60 whitespace-normal">{r.hook ?? "–"}</TableCell>
                    <TableCell>{r.cta ?? "–"}</TableCell>
                    <TableCell>{[r.visualStyle, r.tone].filter(Boolean).join(" · ") || "–"}</TableCell>
                    <TableCell>
                      {r.adUrl ? <a href={r.adUrl} target="_blank" rel="noopener noreferrer" className="text-teal-700 underline">Open</a> : "–"}
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
        <p className="mt-2 text-xs text-stone-500">Links only. Screenshots and video files are not stored.</p>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          {open && <AdForm key={editing?.id ?? "new"} entry={editing} brandId={brandId} rivals={rivals} onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function AdForm({ entry, brandId, rivals, onDone }: { entry: CompetitorAdView | null; brandId: number; rivals: Rival[]; onDone: () => void }) {
  const [f, setF] = useState({
    rivalId: String(entry?.rivalId ?? rivals[0]?.id ?? ""),
    platform: entry?.platform ?? "Meta",
    adUrl: entry?.adUrl ?? "",
    startedOn: entry?.startedOn ?? "",
    hook: entry?.hook ?? "",
    cta: entry?.cta ?? "",
    visualStyle: entry?.visualStyle ?? "",
    tone: entry?.tone ?? "",
    notes: entry?.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await saveAdAction(entry?.id ?? null, { ...f, brandId, rivalId: Number(f.rivalId) });
      if (res.error) return setError(res.error);
      toast.success(entry ? "Ad updated" : "Ad logged");
      onDone();
    });
  }

  return (
    <>
      <DialogHeader><DialogTitle>{entry ? "Edit ad" : "Log a rival ad"}</DialogTitle></DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">Rival
          <select aria-label="Ad rival" className={selectClass} value={f.rivalId} onChange={set("rivalId")}>
            {rivals.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">Platform
          <select aria-label="Ad platform choice" className={selectClass} value={f.platform} onChange={set("platform")}>
            {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">Ad link
          <Input aria-label="Ad link" type="url" placeholder="https://www.facebook.com/ads/library/?id=…" value={f.adUrl} onChange={set("adUrl")} />
        </label>
        <label className="flex flex-col gap-1">Started on
          <Input aria-label="Ad start date" type="date" value={f.startedOn} onChange={set("startedOn")} />
        </label>
        {TEXT_FIELDS.map((t) => (
          <label key={t.key} className="flex flex-col gap-1">{t.label}
            <Input aria-label={`Ad ${t.label}`} value={f[t.key]} onChange={set(t.key)} />
          </label>
        ))}
        <label className="flex flex-col gap-1 sm:col-span-2">Notes
          <Textarea aria-label="Ad notes" value={f.notes} onChange={set("notes")} />
        </label>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <DialogFooter>
        <Button onClick={save} disabled={pending}>{pending ? "Saving…" : "Save ad"}</Button>
      </DialogFooter>
    </>
  );
}
