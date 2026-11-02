"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarRange, ChartColumn, History, House, MonitorSmartphone, ReceiptText, Settings, Target, Wallet, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_GROUPS, NAV_ITEMS } from "./nav-items";

const ICONS: Record<string, LucideIcon> = {
  "/": House,
  "/plan": CalendarRange,
  "/spend": Wallet,
  "/billing": ReceiptText,
  "/performance": ChartColumn,
  "/digital": MonitorSmartphone,
  "/competitors": Target,
  "/uploads": History,
  "/settings": Settings,
};

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <div className="flex h-full flex-col">
      <Link href="/" className="flex items-center gap-2.5 px-5 py-4 md:py-6" aria-label="ACI Media home">
        <span className="grid size-9 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground shadow-sm">A</span>
        <span className="leading-tight">
          <span className="block text-[15px] font-semibold text-gray-900">ACI Media</span>
          <span className="block text-xs text-gray-500">Consumer Brands</span>
        </span>
      </Link>

      <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:gap-0 md:overflow-visible md:pb-0">
        {NAV_GROUPS.map((group) => (
          <div key={group || "top"} className="flex gap-1 md:mb-4 md:flex-col md:gap-0.5">
            {group && <p className="hidden px-3 pb-1 text-[11px] font-medium tracking-wider text-gray-400 uppercase md:block">{group}</p>}
            {NAV_ITEMS.filter((i) => i.group === group).map((item) => {
              const Icon = ICONS[item.href];
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    // Whole 40px row is the target (Fitts's law).
                    "flex h-10 shrink-0 items-center gap-3 rounded-lg px-3 text-sm whitespace-nowrap text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900",
                    active && "bg-accent font-medium text-accent-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  {Icon && <Icon className={cn("size-[18px] shrink-0", active ? "text-primary" : "text-gray-400")} aria-hidden />}
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="m-3 hidden rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-500 md:block">
        <p className="font-medium text-gray-700">Admin</p>
        <p>All amounts in BDT, with VAT</p>
      </div>
    </div>
  );
}
