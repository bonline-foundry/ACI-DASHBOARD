"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Icon-only row button with a visible tooltip and an accessible name. 36px target (Fitts's law). */
export function IconAction({
  label, icon: Icon, onClick, disabled, tone = "default",
}: { label: string; icon: LucideIcon; onClick: () => void; disabled?: boolean; tone?: "default" | "danger" }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-grid size-9 place-items-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-40",
        tone === "danger" ? "hover:text-red-600" : "hover:text-gray-900",
      )}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}
