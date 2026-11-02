"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/data/empty-state";
import { BILL_STATUSES, BILL_STATUS_LABELS } from "@/lib/bill-status";
import { formatMonth } from "@/lib/month";
import { formatTaka, parseAmount } from "@/lib/money";
import type { BillView } from "@/server/billing";
import { AgeChip, StatusChip } from "./chips";
import {
  billHistoryAction, deleteBillAction, markPaidAction, remindAction, saveBillAction, setNoteAction,
} from "./actions";

type Option = { id: number; name: string };
type History = Awaited<ReturnType<typeof billHistoryAction>>;
type Mode = { kind: "bill"; bill: BillView | null } | { kind: "note"; bill: BillView } | null;

const selectClass = "h-8 w-full rounded-lg border border-stone-300 bg-white px-2 text-sm";

export function BillsTable({ rows, vendors, brands, month, filtered }: { rows: BillView[]; vendors: Option[]; brands: Option[]; month: string; filtered: boolean }) {
  const [mode, setMode] = useState<Mode>(null);
  const [pending, startTransition] = useTransition();
  const act = (fn: () => Promise<{ error: string | null }>, done: string) =>
    startTransition(async () => {
      const res = await fn();
      if (res.error) toast.error(res.error);
      else toast.success(done);
    });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Bills</CardTitle>
        <Button onClick={() => setMode({ kind: "bill", bill: null })}>Add bill</Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState title={filtered ? "No bills match" : "No bills yet"} message={filtered ? "Change or clear the filters." : "Add a bill by hand or upload the bills file below."} />
        ) : (
          <div className="overflow-x-auto">
            <Table data-testid="bills-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Bill no</TableHead><TableHead>Vendor</TableHead><TableHead>Brand</TableHead><TableHead>Bill date</TableHead>
                  <TableHead className="text-right">Amount (BDT)</TableHead><TableHead>Status</TableHead><TableHead>Age</TableHead><TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const paid = r.status === "payment_done";
                  return (
                    <TableRow key={r.id} data-testid={`bill-${r.billNo}`}>
                      <TableCell>
                        <button type="button" className="font-medium text-teal-800 underline-offset-2 hover:underline" onClick={() => setMode({ kind: "bill", bill: r })}>{r.billNo}</button>
                        {r.note && <p className="max-w-56 truncate text-xs text-stone-500" title={r.note}>{r.note}</p>}
                      </TableCell>
                      <TableCell>{r.vendorName ?? "–"}</TableCell>
                      <TableCell>{r.brandName ?? "–"}</TableCell>
                      <TableCell className="whitespace-nowrap">{r.billDate}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatTaka(r.amount)}</TableCell>
                      <TableCell>
                        <StatusChip status={r.status} />
                        {r.openReminderId && <span className="ml-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-800">Reminder on</span>}
                      </TableCell>
                      <TableCell>{paid ? <span className="text-xs text-stone-500">Paid {r.paidAt}</span> : <AgeChip days={r.ageDays} bucket={r.bucket} />}</TableCell>
                      <TableCell className="space-x-1 text-right whitespace-nowrap">
                        {!paid && <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => markPaidAction(r.id), `${r.billNo} marked paid`)}>Mark paid</Button>}
                        {!paid && !r.openReminderId && <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => remindAction(r.id), "Reminder added to Home")}>Remind</Button>}
                        <Button size="sm" variant="ghost" onClick={() => setMode({ kind: "note", bill: r })}>Note</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={mode !== null} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent className="sm:max-w-2xl">
          {mode?.kind === "bill" && <BillForm key={mode.bill?.id ?? "new"} bill={mode.bill} vendors={vendors} brands={brands} month={month} onDone={() => setMode(null)} />}
          {mode?.kind === "note" && <NoteForm bill={mode.bill} onDone={() => setMode(null)} />}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function NoteForm({ bill, onDone }: { bill: BillView; onDone: () => void }) {
  const [note, setNote] = useState(bill.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const save = () =>
    startTransition(async () => {
      const res = await setNoteAction(bill.id, note);
      if (res.error) return setError(res.error);
      toast.success("Note saved");
      onDone();
    });
  return (
    <>
      <DialogHeader><DialogTitle>Note for {bill.billNo}</DialogTitle></DialogHeader>
      <Textarea aria-label="Bill note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: sent to finance on 3 Nov" />
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <DialogFooter><Button onClick={save} disabled={pending}>{pending ? "Saving…" : "Save note"}</Button></DialogFooter>
    </>
  );
}

function BillForm({ bill, vendors, brands, month, onDone }: { bill: BillView | null; vendors: Option[]; brands: Option[]; month: string; onDone: () => void }) {
  const [f, setF] = useState({
    billNo: bill?.billNo ?? "", poNo: bill?.poNo ?? "", vendorId: String(bill?.vendorId ?? ""), brandId: String(bill?.brandId ?? ""),
    month: bill?.month ?? month, billDate: bill?.billDate ?? "", amount: bill ? String(bill.amount) : "",
    vatAmount: bill?.vatAmount == null ? "" : String(bill.vatAmount), status: bill?.status ?? "unpaid", paidAt: bill?.paidAt ?? "", note: bill?.note ?? "",
  });
  const [history, setHistory] = useState<History | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  useEffect(() => {
    if (bill) billHistoryAction(bill.id).then(setHistory, () => setHistory([]));
  }, [bill]);

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await saveBillAction(bill?.id ?? null, {
        billNo: f.billNo, poNo: f.poNo, vendorId: f.vendorId ? Number(f.vendorId) : null, brandId: f.brandId ? Number(f.brandId) : null,
        month: f.month, billDate: f.billDate, amount: parseAmount(f.amount) ?? NaN, vatAmount: parseAmount(f.vatAmount),
        status: f.status, paidAt: f.paidAt || null, note: f.note,
      });
      if (res.error) return setError(res.error);
      toast.success(bill ? "Bill updated" : "Bill added");
      onDone();
    });
  }
  function remove() {
    if (!bill || !confirm(`Delete bill ${bill.billNo}?`)) return;
    startTransition(async () => {
      const res = await deleteBillAction(bill.id);
      if (res.error) return setError(res.error);
      toast.success("Bill deleted");
      onDone();
    });
  }

  return (
    <>
      <DialogHeader><DialogTitle>{bill ? `Bill ${bill.billNo}` : "Add bill"}</DialogTitle></DialogHeader>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">Bill no<Input aria-label="Bill no" value={f.billNo} onChange={set("billNo")} /></label>
        <label className="flex flex-col gap-1">PO no<Input aria-label="PO no" value={f.poNo} onChange={set("poNo")} /></label>
        <label className="flex flex-col gap-1">Month<Input aria-label="Bill month" type="month" value={f.month} onChange={set("month")} /></label>
        <label className="flex flex-col gap-1">Vendor
          <select aria-label="Bill vendor" className={selectClass} value={f.vendorId} onChange={set("vendorId")}>
            <option value="">Not set</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">Brand
          <select aria-label="Bill brand" className={selectClass} value={f.brandId} onChange={set("brandId")}>
            <option value="">Not set</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">Bill date<Input aria-label="Bill date" type="date" value={f.billDate} onChange={set("billDate")} /></label>
        <label className="flex flex-col gap-1">Amount (BDT, with VAT)<Input aria-label="Bill amount" inputMode="numeric" value={f.amount} onChange={set("amount")} /></label>
        <label className="flex flex-col gap-1">VAT (BDT)<Input aria-label="Bill VAT" inputMode="numeric" value={f.vatAmount} onChange={set("vatAmount")} /></label>
        <label className="flex flex-col gap-1">Status
          <select aria-label="Bill status" className={selectClass} value={f.status} onChange={set("status")}>
            {BILL_STATUSES.map((s) => <option key={s} value={s}>{BILL_STATUS_LABELS[s]}</option>)}
          </select>
        </label>
        {f.status === "payment_done" && (
          <label className="flex flex-col gap-1">Paid on<Input aria-label="Bill paid on" type="date" value={f.paidAt} onChange={set("paidAt")} /></label>
        )}
        <label className="flex flex-col gap-1 sm:col-span-3">Note<Textarea aria-label="Bill form note" value={f.note} onChange={set("note")} /></label>
      </div>
      {bill && (
        <div className="rounded-lg border border-stone-200 p-3 text-sm">
          <p className="mb-1 font-medium">History</p>
          {history === null ? <p className="text-stone-500">Loading…</p> : history.length === 0 ? <p className="text-stone-500">No changes yet.</p> : (
            <ul className="max-h-36 space-y-1 overflow-y-auto" data-testid="bill-history">
              {history.map((h) => (
                <li key={h.id} className="flex justify-between gap-2 text-stone-600">
                  <span>{h.reason ?? (h.action === "create" ? "Added" : h.action === "upload" ? "Uploaded" : "Edited")}{h.after?.status ? ` · ${BILL_STATUS_LABELS[h.after.status as keyof typeof BILL_STATUS_LABELS] ?? h.after.status}` : ""}</span>
                  <span className="text-xs text-stone-400">{new Date(h.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-stone-500">Month {formatMonth(bill.month)} · {bill.source === "manual" ? "Manual edit" : "Uploaded"}</p>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <DialogFooter className="gap-2">
        {bill && <Button variant="ghost" onClick={remove} disabled={pending}>Delete</Button>}
        <Button onClick={save} disabled={pending}>{pending ? "Saving…" : "Save bill"}</Button>
      </DialogFooter>
    </>
  );
}
