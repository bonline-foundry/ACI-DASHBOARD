import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Mixpanel-style segmented control: options joined in one bordered group, the chosen one filled.
 * Few options in a row are faster to pick than a dropdown (Hick's law).
 */
const group = "inline-flex shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-white text-sm shadow-xs";
const item = (active: boolean) =>
  cn(
    "flex h-9 items-center px-3.5 whitespace-nowrap transition-colors not-first:border-l not-first:border-gray-200",
    active ? "bg-gray-100 font-medium text-gray-900" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
  );

export function SegmentedLinks({ label, items, value }: { label: string; items: { key: string; label: string; href: string }[]; value: string }) {
  return (
    <nav aria-label={label} className={group}>
      {items.map((i) => (
        <Link key={i.key} href={i.href} aria-current={value === i.key ? "page" : undefined} className={item(value === i.key)}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

export function SegmentedButtons<T extends string>({
  label, items, value, onChange,
}: { label: string; items: { key: T; label: string }[]; value: T; onChange: (key: T) => void }) {
  return (
    <div role="group" aria-label={label} className={group}>
      {items.map((i) => (
        <button key={i.key || "all"} type="button" aria-pressed={value === i.key} onClick={() => onChange(i.key)} className={item(value === i.key)}>
          {i.label}
        </button>
      ))}
    </div>
  );
}
