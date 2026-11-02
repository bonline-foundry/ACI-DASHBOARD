"use client";

import { useState, useTransition } from "react";
import { useClearNewParam } from "@/lib/use-new-param";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { IconAction } from "@/components/data/row-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/data/empty-state";
import { formatMonth } from "@/lib/month";
import { formatTaka } from "@/lib/money";
import { cn } from "@/lib/utils";
import { deleteSpendAction, saveSpendAction } from "./actions";

type Option = { id: number; name: string };
export type SpendRow = {
  id: number;
  brandId: number;
  brandName: string;
  month: string;
  entryDate: string | null;
  channelId: number;
  channelName: string;
  tvStationId: number | null;
  tvStationName: string | null;
  vendorId: number | null;
  vendorName: string | null;
  amount: number;
  note: string | null;
  source: "upload" | "manual";
};

const selectClass = "h-9 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm";

export function SpendEntries({
  month, rows, brands, channels, stations, vendors, brandId, autoOpen = false,
}: { month: string; rows: SpendRow[]; brands: Option[]; channels: Option[]; stations: Option[]; vendors: Option[]; brandId?: number; autoOpen?: boolean }) {
  const [open, setOpen] = useState(autoOpen && brands.length > 0);
  useClearNewParam(autoOpen);
  const [editing, setEditing] = useState<SpendRow | null>(null);
  const [pending, startTransition] = useTransition();
  const edit = (r: SpendRow | null) => {
    setEditing(r);
    setOpen(true);
  };
  const remove = (r: SpendRow) => {
    if (!confirm(`Delete ${formatTaka(r.amount)} BDT for ${r.brandName} (${r.channelName})?`)) return;
    startTransition(async () => {
      const res = await deleteSpendAction(r.id);
      if (res.error) toast.error(res.error);
      else toast.success("Entry deleted");
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Entries for {formatMonth(month)}</CardTitle>
        <Button onClick={() => edit(null)} disabled={brands.length === 0}>Add entry</Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState title="No spend entries this month" message="Upload the spend file below or add an entry by hand." />
        ) : (
          <div className="overflow-x-auto">
            <Table data-testid="spend-entries">
              <TableHeader>
                <TableRow>
                  <TableHead>Brand</TableHead><TableHead>Channel</TableHead><TableHead>TV station</TableHead><TableHead>Agency</TableHead>
                  <TableHead>Date</TableHead><TableHead className="text-right">Amount (BDT)</TableHead><TableHead>Source</TableHead><TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.brandName}</TableCell>
                    <TableCell>{r.channelName}</TableCell>
                    <TableCell>{r.tvStationName ?? "–"}</TableCell>
                    <TableCell>{r.vendorName ?? "–"}</TableCell>
                    <TableCell>{r.entryDate ?? "–"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatTaka(r.amount)}</TableCell>
                    <TableCell>
                      <span className={cn("rounded-full px-2 py-0.5 text-xs", r.source === "manual" ? "bg-violet-100 text-violet-800" : "bg-gray-100 text-gray-700")}>
                        {r.source === "manual" ? "Manual edit" : "Uploaded"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <IconAction label="Edit" icon={Pencil} onClick={() => edit(r)} />
                      <IconAction label="Delete" icon={Trash2} tone="danger" onClick={() => remove(r)} disabled={pending} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="mt-2 text-xs text-gray-500">Editing an uploaded row turns it into a manual edit. Manual edits are kept when the month is uploaded again.</p>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          {open && (
            <EntryForm key={editing?.id ?? "new"} entry={editing} month={month} brands={brands} channels={channels}
              stations={stations} vendors={vendors} brandId={brandId} onDone={() => setOpen(false)} />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function EntryForm({
  entry, month, brands, channels, stations, vendors, brandId, onDone,
}: { entry: SpendRow | null; month: string; brands: Option[]; channels: Option[]; stations: Option[]; vendors: Option[]; brandId?: number; onDone: () => void }) {
  const [f, setF] = useState({
    brandId: String(entry?.brandId ?? brandId ?? brands[0]?.id ?? ""),
    month: entry?.month ?? month,
    entryDate: entry?.entryDate ?? "",
    channelId: String(entry?.channelId ?? channels[0]?.id ?? ""),
    tvStationId: String(entry?.tvStationId ?? ""),
    vendorId: String(entry?.vendorId ?? ""),
    amount: entry ? String(entry.amount) : "",
    note: entry?.note ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await saveSpendAction(entry?.id ?? null, {
        brandId: Number(f.brandId), month: f.month, entryDate: f.entryDate || null, channelId: Number(f.channelId),
        tvStationId: f.tvStationId ? Number(f.tvStationId) : null, vendorId: f.vendorId ? Number(f.vendorId) : null,
        amount: Number(f.amount.replace(/,/g, "")), note: f.note,
      });
      if (res.error) return setError(res.error);
      toast.success(entry ? "Entry updated" : "Entry added");
      onDone();
    });
  }

  return (
    <>
      <DialogHeader><DialogTitle>{entry ? "Edit spend entry" : "Add spend entry"}</DialogTitle></DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">Brand
          <select aria-label="Spend brand" className={selectClass} value={f.brandId} onChange={set("brandId")}>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">Month
          <Input aria-label="Spend month" type="month" value={f.month} onChange={set("month")} />
        </label>
        <label className="flex flex-col gap-1">Channel
          <select aria-label="Spend channel" className={selectClass} value={f.channelId} onChange={set("channelId")}>
            {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">Date (optional)
          <Input aria-label="Spend date" type="date" value={f.entryDate} onChange={set("entryDate")} />
        </label>
        <label className="flex flex-col gap-1">TV station (optional)
          <select aria-label="Spend TV station" className={selectClass} value={f.tvStationId} onChange={set("tvStationId")}>
            <option value="">None</option>
            {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">Agency or vendor (optional)
          <select aria-label="Spend vendor" className={selectClass} value={f.vendorId} onChange={set("vendorId")}>
            <option value="">None</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">Amount (BDT, with VAT)
          <Input aria-label="Spend amount" inputMode="numeric" value={f.amount} onChange={set("amount")} placeholder="4,430,000" />
        </label>
        <label className="flex flex-col gap-1">Note
          <Input aria-label="Spend note" value={f.note} onChange={set("note")} />
        </label>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <DialogFooter>
        <Button onClick={save} disabled={pending}>{pending ? "Saving…" : "Save entry"}</Button>
      </DialogFooter>
    </>
  );
}
