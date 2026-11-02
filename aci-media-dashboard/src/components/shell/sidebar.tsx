"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";

export function Sidebar() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-1 p-4">
      <div className="mb-6 px-2">
        <p className="text-lg font-semibold text-stone-900">ACI Media</p>
        <p className="text-xs text-stone-500">Consumer Brands dashboard</p>
      </div>
      {NAV_ITEMS.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-2 text-sm text-stone-700 hover:bg-stone-200/60",
              active && "bg-stone-900 text-white hover:bg-stone-900",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
