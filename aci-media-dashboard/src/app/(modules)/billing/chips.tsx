import { cn } from "@/lib/utils";
import type { AgeBucket } from "@/lib/rules";
import { BILL_STATUS_LABELS, type BillStatus } from "@/lib/bill-status";

const STATUS_CLASS: Record<BillStatus, string> = {
  payment_done: "bg-emerald-100 text-emerald-800",
  cheque_in_hand: "bg-sky-100 text-sky-800",
  cheque_in_counter: "bg-sky-100 text-sky-800",
  finance_audit: "bg-amber-100 text-amber-900",
  bill_error: "bg-red-100 text-red-800",
  unpaid: "bg-stone-200 text-stone-700",
};

export function StatusChip({ status }: { status: BillStatus }) {
  return <span className={cn("rounded-full px-2 py-0.5 text-xs whitespace-nowrap", STATUS_CLASS[status])}>{BILL_STATUS_LABELS[status]}</span>;
}

const AGE_CLASS: Record<AgeBucket, string> = {
  fresh: "bg-stone-100 text-stone-700",
  yellow: "bg-amber-100 text-amber-900",
  red: "bg-red-100 text-red-800",
};

export function AgeChip({ days, bucket }: { days: number | null; bucket: AgeBucket | null }) {
  if (days === null || !bucket) return <span className="text-stone-400">–</span>;
  return <span className={cn("rounded-full px-2 py-0.5 text-xs whitespace-nowrap tabular-nums", AGE_CLASS[bucket])}>{days} {days === 1 ? "day" : "days"}</span>;
}
