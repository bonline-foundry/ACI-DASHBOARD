import * as XLSX from "xlsx";
import type { Db } from "@/db/types";
import { BILL_STATUS_LABELS } from "@/lib/bill-status";
import { addMonths, formatMonth } from "@/lib/month";
import { listBills, type BillFilter } from "./billing";
import { listSpendEntries, spendMatrix, type ChannelGroup } from "./spend";

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type Cell = string | number | null;

function sheet(rows: Cell[][], widths: number[]) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = widths.map((wch) => ({ wch }));
  return ws;
}

const toBytes = (wb: XLSX.WorkBook) => new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));

/** Same 4 months, brand and media filter as the Spend page. Amounts are whole taka with VAT. */
export async function spendWorkbook(db: Db, q: { month: string; brandId?: number; group?: ChannelGroup }) {
  const months = [-3, -2, -1, 0].map((n) => addMonths(q.month, n));
  const [matrix, entries] = await Promise.all([
    spendMatrix(db, { months, brandId: q.brandId, group: q.group }),
    listSpendEntries(db, { month: q.month, brandId: q.brandId }),
  ]);
  const table: Cell[][] = [
    ["Brand", ...months.map(formatMonth), "Total (BDT)"],
    ...matrix.rows.map((r) => [r.brandName, ...months.map((m) => r.cells[m] ?? 0), r.total]),
    ["All brands", ...months.map((m) => matrix.totals[m] ?? 0), matrix.grandTotal],
  ];
  const list: Cell[][] = [
    ["Month", "Date", "Brand", "Channel", "TV station", "Agency or vendor", "Amount (BDT, with VAT)", "Note", "Source"],
    ...entries.map((e) => [e.month, e.entryDate, e.brandName, e.channelName, e.tvStationName, e.vendorName, e.amount, e.note, e.source === "manual" ? "Manual" : "Uploaded"]),
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet(table, [24, 16, 16, 16, 16, 16]), "Spend by month");
  XLSX.utils.book_append_sheet(wb, sheet(list, [10, 12, 24, 12, 18, 20, 20, 24, 10]), "Entries");
  return toBytes(wb);
}

/** Same filters as the Billing page. */
export async function billsWorkbook(db: Db, today: string, f: BillFilter) {
  const rows = await listBills(db, today, f);
  const data: Cell[][] = [
    ["Bill no", "PO no", "Vendor", "Brand", "Month", "Bill date", "Amount (BDT, with VAT)", "VAT (BDT)", "Status", "Paid on", "Age (days)", "Note"],
    ...rows.map((b) => [b.billNo, b.poNo, b.vendorName, b.brandName, b.month, b.billDate, b.amount, b.vatAmount, BILL_STATUS_LABELS[b.status], b.paidAt, b.ageDays, b.note]),
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet(data, [18, 12, 20, 22, 10, 12, 20, 12, 18, 12, 10, 30]), "Bills");
  return toBytes(wb);
}
