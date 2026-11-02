import { monthBounds } from "./month";

export type Span = { id: number; start: string; end: string };

const DAY = 86_400_000;
const utc = (d: string) => Date.parse(`${d}T00:00:00Z`);

export function barPosition(start: string, end: string, month: string): { offset: number; span: number } | null {
  const b = monthBounds(month);
  const s = Math.max(utc(start), utc(b.start));
  const e = Math.min(utc(end), utc(b.end));
  if (e < s) return null;
  return { offset: Math.round((s - utc(b.start)) / DAY), span: Math.round((e - s) / DAY) + 1 };
}

export function assignLanes(items: Span[]): Map<number, number> {
  const sorted = [...items].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.id - b.id);
  const laneEnds: string[] = [];
  const out = new Map<number, number>();
  for (const it of sorted) {
    let lane = laneEnds.findIndex((end) => end < it.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(it.end);
    } else {
      laneEnds[lane] = it.end;
    }
    out.set(it.id, lane);
  }
  return out;
}
