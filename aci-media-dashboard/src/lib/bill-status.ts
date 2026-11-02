export type BillStatus = "unpaid" | "payment_done" | "cheque_in_hand" | "cheque_in_counter" | "finance_audit" | "bill_error";
export const BILL_STATUSES: BillStatus[] = ["unpaid", "payment_done", "cheque_in_hand", "cheque_in_counter", "finance_audit", "bill_error"];
export const BILL_STATUS_LABELS: Record<BillStatus, string> = {
  unpaid: "Unpaid",
  payment_done: "Payment Done",
  cheque_in_hand: "Cheque in Hand",
  cheque_in_counter: "Cheque in Counter",
  finance_audit: "Finance/Audit",
  bill_error: "Bill Error",
};
