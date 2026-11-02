"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMillion, formatTaka } from "@/lib/money";
import type { CampaignStatus, CampaignView } from "@/server/plan";
import { deleteCampaignAction, saveCampaignAction } from "./actions";

type Option = { id: number; name: string };
type Line = { channelId: string; amount: string };

const selectClass = "h-8 w-full rounded-lg border border-stone-300 bg-white px-2 text-sm";

export function CampaignDialog({
  open,
  onOpenChange,
  campaign,
  brands,
  channels,
  defaultStart,
  defaultBrandId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: CampaignView | null;
  brands: Option[];
  channels: Option[];
  defaultStart: string;
  defaultBrandId?: number;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {open && (
          <CampaignForm
            key={campaign?.id ?? "new"}
            campaign={campaign}
            brands={brands}
            channels={channels}
            defaultStart={defaultStart}
            defaultBrandId={defaultBrandId}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CampaignForm({
  campaign,
  brands,
  channels,
  defaultStart,
  defaultBrandId,
  onDone,
}: {
  campaign: CampaignView | null;
  brands: Option[];
  channels: Option[];
  defaultStart: string;
  defaultBrandId?: number;
  onDone: () => void;
}) {
  const [brandId, setBrandId] = useState(String(campaign?.brandId ?? defaultBrandId ?? brands[0]?.id ?? ""));
  const [name, setName] = useState(campaign?.name ?? "");
  const [startDate, setStartDate] = useState(campaign?.startDate ?? defaultStart);
  const [endDate, setEndDate] = useState(campaign?.endDate ?? defaultStart);
  const [status, setStatus] = useState<CampaignStatus>(campaign?.status ?? "planned");
  const [notes, setNotes] = useState(campaign?.notes ?? "");
  const [lines, setLines] = useState<Line[]>(
    campaign?.lines.map((l) => ({ channelId: String(l.channelId), amount: String(l.plannedAmount) })) ?? [
      { channelId: String(channels[0]?.id ?? ""), amount: "" },
    ],
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const amountOf = (s: string) => Number(s.replace(/,/g, "")) || 0;
  const total = lines.reduce((sum, l) => sum + amountOf(l.amount), 0);
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await saveCampaignAction(campaign?.id ?? null, {
        brandId: Number(brandId),
        name,
        startDate,
        endDate,
        status,
        notes,
        lines: lines.map((l) => ({ channelId: Number(l.channelId), plannedAmount: amountOf(l.amount) })),
      });
      if (res.error) return setError(res.error);
      toast.success(campaign ? "Campaign updated" : "Campaign added");
      onDone();
    });
  }

  function remove() {
    if (!campaign || !confirm(`Delete "${campaign.name}"? This cannot be undone.`)) return;
    startTransition(async () => {
      const res = await deleteCampaignAction(campaign.id);
      if (res.error) return setError(res.error);
      toast.success("Campaign deleted");
      onDone();
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{campaign ? "Edit campaign" : "Add campaign"}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          Brand
          <select aria-label="Campaign brand" className={selectClass} value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Campaign name
          <Input aria-label="Campaign name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Puja TV burst" />
        </label>
        <label className="flex flex-col gap-1">
          Start date
          <Input aria-label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          End date
          <Input aria-label="End date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          Status
          <select aria-label="Status" className={selectClass} value={status} onChange={(e) => setStatus(e.target.value as CampaignStatus)}>
            <option value="planned">Planned</option>
            <option value="live">Live</option>
            <option value="done">Done</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Notes
          <Input aria-label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1 font-medium">Planned cost by channel (BDT, with VAT)</legend>
        {lines.map((l, i) => (
          <div key={i} className="flex gap-2">
            <select aria-label={`Channel ${i + 1}`} className={selectClass} value={l.channelId} onChange={(e) => setLine(i, { channelId: e.target.value })}>
              {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <Input
              aria-label={`Amount ${i + 1}`}
              inputMode="numeric"
              placeholder="0"
              value={l.amount}
              onChange={(e) => setLine(i, { amount: e.target.value })}
            />
            <Button type="button" variant="ghost" size="sm" aria-label={`Remove channel ${i + 1}`} disabled={lines.length === 1}
              onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
              ×
            </Button>
          </div>
        ))}
        <div className="flex items-center justify-between">
          <Button type="button" variant="outline" size="sm"
            onClick={() => setLines((ls) => [...ls, { channelId: String(channels[0]?.id ?? ""), amount: "" }])}>
            Add channel
          </Button>
          <p className="text-sm text-stone-600">Total: {formatTaka(total)} BDT ({formatMillion(total)}M)</p>
        </div>
      </fieldset>

      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

      <DialogFooter className="flex-row justify-between sm:justify-between">
        {campaign ? (
          <Button type="button" variant="destructive" onClick={remove} disabled={pending}>Delete</Button>
        ) : <span />}
        <Button type="button" onClick={save} disabled={pending}>{pending ? "Saving…" : "Save campaign"}</Button>
      </DialogFooter>
    </>
  );
}
