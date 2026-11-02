"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/data/empty-state";
import { SourceTag } from "@/components/data/source-tag";
import { CHANNEL_COLORS, FALLBACK_COLOR, mainChannel } from "@/lib/channel-colors";
import { formatMillion } from "@/lib/money";
import { daysInMonth, monthBounds } from "@/lib/month";
import { assignLanes, barPosition } from "@/lib/timeline";
import { cn } from "@/lib/utils";
import type { CampaignView } from "@/server/plan";
import { CampaignDialog } from "./campaign-dialog";

export type PlanView = "timeline" | "calendar" | "list";
type Option = { id: number; name: string };

const STATUS_CLASS = { planned: "bg-stone-100 text-stone-700", live: "bg-emerald-100 text-emerald-800", done: "bg-sky-100 text-sky-800" };
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const colorOf = (c: CampaignView) => CHANNEL_COLORS[mainChannel(c.lines) ?? ""] ?? FALLBACK_COLOR;
const dateLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export function PlanBoard({
  view,
  month,
  today,
  brands,
  channels,
  campaigns,
  brandId,
}: {
  view: PlanView;
  month: string;
  today: string;
  brands: Option[];
  channels: Option[];
  campaigns: CampaignView[];
  brandId?: number;
}) {
  const [editing, setEditing] = useState<CampaignView | null>(null);
  const [open, setOpen] = useState(false);
  const openCampaign = (c: CampaignView | null) => {
    setEditing(c);
    setOpen(true);
  };
  const defaultStart = today.startsWith(month) ? today : monthBounds(month).start;

  if (brands.length === 0) {
    return (
      <EmptyState title="No brands yet" message="Add ACI's brands in Settings first, then plan their campaigns here.">
        <a href="/settings" className="text-sm font-medium underline">Open Settings</a>
      </EmptyState>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <Legend />
        <Button onClick={() => openCampaign(null)}>Add campaign</Button>
      </div>

      {view === "timeline" && <Timeline month={month} today={today} brands={brands} campaigns={campaigns} onSelect={openCampaign} />}
      {view === "calendar" && <Calendar month={month} today={today} campaigns={campaigns} onSelect={openCampaign} />}
      {view === "list" && <List campaigns={campaigns} onSelect={openCampaign} />}

      {campaigns.length === 0 && (
        <EmptyState title="No campaigns this month" message="Add a campaign with its dates and planned cost per channel." />
      )}

      <CampaignDialog
        open={open}
        onOpenChange={setOpen}
        campaign={editing}
        brands={brands}
        channels={channels}
        defaultStart={defaultStart}
        defaultBrandId={brandId}
      />
    </section>
  );
}

function Legend() {
  const items: [string, string][] = [["TV", "TV"], ["PRESS", "Press"], ["RADIO", "Radio"], ["OOH", "OOH"], ["META", "Meta"], ["YOUTUBE", "YouTube"], ["TIKTOK", "TikTok"], ["DIGITAL", "Digital"]];
  return (
    <ul className="flex flex-wrap gap-3 text-xs text-stone-600" aria-label="Channel colours">
      {items.map(([code, label]) => (
        <li key={code} className="flex items-center gap-1">
          <span className={cn("inline-block size-3 rounded-sm", CHANNEL_COLORS[code])} />
          {label}
        </li>
      ))}
    </ul>
  );
}

function Timeline({
  month, today, brands, campaigns, onSelect,
}: { month: string; today: string; brands: Option[]; campaigns: CampaignView[]; onSelect: (c: CampaignView) => void }) {
  const days = daysInMonth(month);
  const todayOffset = today.startsWith(month) ? Number(today.slice(8, 10)) - 1 : null;
  const pct = (n: number) => `${(n / days) * 100}%`;
  const LANE = 30;

  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white" data-testid="plan-timeline">
      <div className="min-w-[900px]">
        <div className="flex border-b border-stone-200 text-[11px] text-stone-500">
          <div className="w-40 shrink-0 px-3 py-2 font-medium">Brand</div>
          <div className="relative flex flex-1">
            {Array.from({ length: days }, (_, i) => (
              <div key={i} className={cn("flex-1 py-2 text-center", todayOffset === i && "font-semibold text-stone-900")}>{i + 1}</div>
            ))}
          </div>
        </div>
        {brands.map((b) => {
          const own = campaigns.filter((c) => c.brandId === b.id);
          const lanes = assignLanes(own.map((c) => ({ id: c.id, start: c.startDate, end: c.endDate })));
          const laneCount = Math.max(1, ...[...lanes.values()].map((l) => l + 1));
          return (
            <div key={b.id} className="flex border-b border-stone-100 last:border-b-0">
              <div className="w-40 shrink-0 px-3 py-2 text-sm font-medium text-stone-800">{b.name}</div>
              <div className="relative flex-1" style={{ height: laneCount * LANE + 8 }}>
                {todayOffset !== null && (
                  <div aria-hidden className="absolute inset-y-0 w-px bg-red-400" style={{ left: pct(todayOffset + 0.5) }} />
                )}
                {own.map((c) => {
                  const pos = barPosition(c.startDate, c.endDate, month);
                  if (!pos) return null;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onSelect(c)}
                      title={`${c.name} · ${dateLabel(c.startDate)} to ${dateLabel(c.endDate)} · ${formatMillion(c.total)}M`}
                      className={cn("absolute truncate rounded px-2 text-left text-xs font-medium shadow-sm hover:opacity-90", colorOf(c))}
                      style={{ left: pct(pos.offset), width: pct(pos.span), top: 4 + (lanes.get(c.id) ?? 0) * LANE, height: LANE - 6 }}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Calendar({
  month, today, campaigns, onSelect,
}: { month: string; today: string; campaigns: CampaignView[]; onSelect: (c: CampaignView) => void }) {
  const days = daysInMonth(month);
  const firstWeekday = (new Date(`${month}-01T00:00:00Z`).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  while (cells.length % 7) cells.push(null);

  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white" data-testid="plan-calendar">
      <div className="grid min-w-[700px] grid-cols-7">
        {WEEKDAYS.map((d) => <div key={d} className="border-b border-stone-200 px-2 py-1 text-xs font-medium text-stone-500">{d}</div>)}
        {cells.map((date, i) => {
          const on = date ? campaigns.filter((c) => c.startDate <= date && c.endDate >= date) : [];
          return (
            <div key={i} className={cn("min-h-24 border-b border-r border-stone-100 p-1", !date && "bg-stone-50")}>
              {date && (
                <>
                  <p className={cn("text-xs text-stone-500", date === today && "font-semibold text-red-600")}>{Number(date.slice(8))}</p>
                  <div className="mt-1 space-y-0.5">
                    {on.slice(0, 3).map((c) => (
                      <button key={c.id} type="button" onClick={() => onSelect(c)}
                        className={cn("block w-full truncate rounded px-1 text-left text-[11px]", colorOf(c))}>
                        {c.brandName}: {c.name}
                      </button>
                    ))}
                    {on.length > 3 && <p className="text-[11px] text-stone-500">+{on.length - 3} more</p>}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function List({ campaigns, onSelect }: { campaigns: CampaignView[]; onSelect: (c: CampaignView) => void }) {
  if (campaigns.length === 0) return null;
  return (
    <div className="rounded-lg border border-stone-200 bg-white" data-testid="plan-list">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Brand</TableHead>
            <TableHead>Campaign</TableHead>
            <TableHead>Dates</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Channels</TableHead>
            <TableHead className="text-right">Planned (M)</TableHead>
            <TableHead>Source</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {campaigns.map((c) => (
            <TableRow key={c.id} className="cursor-pointer" onClick={() => onSelect(c)}>
              <TableCell>{c.brandName}</TableCell>
              <TableCell className="font-medium">{c.name}</TableCell>
              <TableCell>{dateLabel(c.startDate)} to {dateLabel(c.endDate)}</TableCell>
              <TableCell><span className={cn("rounded-full px-2 py-0.5 text-xs capitalize", STATUS_CLASS[c.status])}>{c.status}</span></TableCell>
              <TableCell>{c.lines.map((l) => l.name).join(", ")}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMillion(c.total)}</TableCell>
              <TableCell><SourceTag source={c.source} updatedAt={c.updatedAt} label="" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
