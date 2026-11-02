export const CHANNEL_COLORS: Record<string, string> = {
  TV: "bg-teal-600 text-white",
  PRESS: "bg-amber-500 text-gray-950",
  RADIO: "bg-violet-600 text-white",
  OOH: "bg-emerald-600 text-white",
  DIGITAL: "bg-rose-600 text-white",
  META: "bg-blue-700 text-white",
  YOUTUBE: "bg-red-600 text-white",
  TIKTOK: "bg-gray-800 text-white",
};

export const FALLBACK_COLOR = "bg-gray-500 text-white";

export function mainChannel(lines: { code: string; plannedAmount: number }[]): string | null {
  if (lines.length === 0) return null;
  return lines.reduce((best, l) => (l.plannedAmount > best.plannedAmount ? l : best)).code;
}
