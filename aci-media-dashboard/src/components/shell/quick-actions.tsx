"use client";

import { useRouter } from "next/navigation";
import { CalendarPlus, ChevronDown, FileDown, Plus, ReceiptText, Wallet } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Every action opens something that already works (the page opens its dialog from ?new=…).
const ACTIONS = [
  { href: "/plan?new=campaign", label: "New campaign", icon: CalendarPlus },
  { href: "/spend?new=entry", label: "New spend entry", icon: Wallet },
  { href: "/billing?new=bill", label: "New bill", icon: ReceiptText },
];

function downloadBills() {
  const a = document.createElement("a");
  a.href = "/api/export/bills";
  a.download = "";
  a.click();
}

export function QuickActions() {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-medium text-gray-900 shadow-sm transition-colors hover:bg-gray-100 focus-visible:ring-3 focus-visible:ring-sidebar-ring/60 focus-visible:outline-none"
      >
        <Plus className="size-4" aria-hidden />
        Quick actions
        <ChevronDown className="size-4 text-gray-500" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        {/* Base UI requires a group label to sit inside a group. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>Create</DropdownMenuLabel>
          {ACTIONS.map((a) => (
            <DropdownMenuItem key={a.href} onClick={() => router.push(a.href)}>
              <a.icon aria-hidden />
              {a.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={downloadBills}>
          <FileDown aria-hidden />
          Export all bills
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
