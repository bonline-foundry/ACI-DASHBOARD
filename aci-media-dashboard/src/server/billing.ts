import { and, desc, eq, ilike, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { bills, brands, historyLog, reminders, vendors } from "@/db/schema";
import type { Db } from "@/db/types";
import { logChange } from "@/db/history";
import { BILL_STATUSES, BILL_STATUS_LABELS, type BillStatus } from "@/lib/bill-status";
import { isIsoDate, isMonth, todayDhaka } from "@/lib/month";
import { ageBucket, billAgeDays, type AgeBucket } from "@/lib/rules";
import { ValidationError } from "./errors";
import { getThresholds } from "./master-data";
import { normName } from "./lookups";

export { BILL_STATUSES, BILL_STATUS_LABELS, type BillStatus };

const STATUS_WORDS: Record<string, BillStatus> = {
  ...Object.fromEntries(BILL_STATUSES.map((s) => [normName(BILL_STATUS_LABELS[s]), s])),
  ...Object.fromEntries(BILL_STATUSES.map((s) => [s.replace(/_/g, " "), s])),
  paid: "payment_done", done: "payment_done", "not paid": "unpaid", pending: "unpaid", audit: "finance_audit", finance: "finance_audit",
  "finance audit": "finance_audit", error: "bill_error",
};

/** Blank means unpaid. Returns null for words we do not know. */
export function parseBillStatus(s: string | null): BillStatus | null {
  if (s === null || !s.trim()) return "unpaid";
  return STATUS_WORDS[normName(s)] ?? null;
}

export type BillInput = {
  billNo: string;
  poNo?: string | null;
  vendorId?: number | null;
  brandId?: number | null;
  month: string;
  billDate: string;
  amount: number;
  vatAmount?: number | null;
  status?: BillStatus | string | null;
  paidAt?: string | null;
  note?: string | null;
};

const text = (v: string | null | undefined) => v?.trim().replace(/\s+/g, " ") || null;

/** Checks one bill. Shared by manual entry and upload (lookups of vendor and brand happen elsewhere). */
export function checkBill(i: BillInput, today: string) {
  const billNo = text(i.billNo);
  if (!billNo) throw new ValidationError("Bill no is required");
  if (!isMonth(i.month)) throw new ValidationError("Month must look like 2026-10");
  if (!isIsoDate(i.billDate)) throw new ValidationError("Bill date is not a valid date");
  if (!Number.isInteger(i.amount) || i.amount < 0) throw new ValidationError("Amount must be whole taka, 0 or more");
  const vat = i.vatAmount ?? null;
  if (vat !== null && (!Number.isInteger(vat) || vat < 0)) throw new ValidationError("VAT must be whole taka, 0 or more");
  if (vat !== null && vat > i.amount) throw new ValidationError("VAT cannot be more than the amount");
  const status = BILL_STATUSES.includes(i.status as BillStatus) ? (i.status as BillStatus) : i.status ? null : "unpaid";
  if (!status) throw new ValidationError("Unknown bill status");
  let paidAt: string | null = null;
  if (status === "payment_done") {
    paidAt = text(i.paidAt) ?? today;
    if (!isIsoDate(paidAt)) throw new ValidationError("Paid date is not a valid date");
    if (paidAt < i.billDate) throw new ValidationError("Paid date cannot be before the bill date");
  }
  return { billNo, poNo: text(i.poNo), month: i.month, billDate: i.billDate, amount: i.amount, vatAmount: vat, status, paidAt, note: i.note?.trim() || null };
}

async function findByBillNo(db: Db, billNo: string, exceptId?: number | null) {
  return db.select({ id: bills.id }).from(bills)
    .where(and(sql`lower(${bills.billNo}) = lower(${billNo})`, ...(exceptId ? [ne(bills.id, exceptId)] : [])));
}

export async function saveBill(db: Db, id: number | null, input: BillInput) {
  const values = { ...checkBill(input, todayDhaka()), vendorId: input.vendorId || null, brandId: input.brandId || null };
  if (values.vendorId) {
    const [v] = await db.select({ id: vendors.id }).from(vendors).where(eq(vendors.id, values.vendorId));
    if (!v) throw new ValidationError("Vendor not found");
  }
  if (values.brandId) {
    const [b] = await db.select({ id: brands.id }).from(brands).where(eq(brands.id, values.brandId));
    if (!b) throw new ValidationError("Brand not found");
  }
  if ((await findByBillNo(db, values.billNo, id)).length) throw new ValidationError(`Bill no "${values.billNo}" already exists`);

  if (!id) {
    const [row] = await db.insert(bills).values({ ...values, source: "manual" }).returning();
    await logChange(db, { entity: "bill", entityId: row.id, action: "create", after: row });
    return row;
  }
  const [before] = await db.select().from(bills).where(eq(bills.id, id));
  if (!before) throw new ValidationError("Bill not found");
  const [row] = await db.update(bills).set({ ...values, source: "manual", updatedAt: sql`now()` }).where(eq(bills.id, id)).returning();
  await logChange(db, { entity: "bill", entityId: id, action: "update", before, after: row });
  if (row.status === "payment_done") await closeReminders(db, id);
  return row;
}

async function changeBill(db: Db, id: number, patch: Partial<typeof bills.$inferInsert>, reason?: string) {
  const [before] = await db.select().from(bills).where(eq(bills.id, id));
  if (!before) throw new ValidationError("Bill not found");
  const [row] = await db.update(bills).set({ ...patch, source: "manual", updatedAt: sql`now()` }).where(eq(bills.id, id)).returning();
  await logChange(db, { entity: "bill", entityId: id, action: "update", before, after: row, reason });
  return { before, row };
}

export async function deleteBill(db: Db, id: number) {
  const [before] = await db.delete(bills).where(eq(bills.id, id)).returning();
  if (!before) throw new ValidationError("Bill not found");
  await logChange(db, { entity: "bill", entityId: id, action: "delete", before });
}

export async function markBillPaid(db: Db, id: number, paidOn: string) {
  if (!isIsoDate(paidOn)) throw new ValidationError("Paid date is not a valid date");
  const [b] = await db.select({ billDate: bills.billDate }).from(bills).where(eq(bills.id, id));
  if (!b) throw new ValidationError("Bill not found");
  if (paidOn < b.billDate) throw new ValidationError("Paid date cannot be before the bill date");
  await changeBill(db, id, { status: "payment_done", paidAt: paidOn }, "Marked paid");
  await closeReminders(db, id);
}

export async function setBillNote(db: Db, id: number, note: string) {
  await changeBill(db, id, { note: note.trim() || null }, "Note");
}

async function closeReminders(db: Db, billId: number) {
  await db.update(reminders).set({ resolvedAt: sql`now()` }).where(and(eq(reminders.billId, billId), isNull(reminders.resolvedAt)));
}

export async function remindBill(db: Db, id: number) {
  const [b] = await db.select({ id: bills.id, status: bills.status }).from(bills).where(eq(bills.id, id));
  if (!b) throw new ValidationError("Bill not found");
  if (b.status === "payment_done") throw new ValidationError("This bill is already paid");
  const [open] = await db.select({ id: reminders.id }).from(reminders).where(and(eq(reminders.billId, id), isNull(reminders.resolvedAt)));
  if (open) return;
  const [r] = await db.insert(reminders).values({ billId: id }).returning();
  await logChange(db, { entity: "reminder", entityId: r.id, action: "create", after: r });
}

export async function resolveReminder(db: Db, reminderId: number) {
  const [r] = await db.update(reminders).set({ resolvedAt: sql`now()` }).where(eq(reminders.id, reminderId)).returning();
  if (!r) throw new ValidationError("Reminder not found");
  await logChange(db, { entity: "reminder", entityId: reminderId, action: "update", after: r });
}

export type AgeFilter = AgeBucket | "paid";
export type BillFilter = { search?: string; status?: BillStatus; brandId?: number; age?: AgeFilter };

export async function listBills(db: Db, today: string, f: BillFilter = {}) {
  const t = await getThresholds(db);
  const conds: SQL[] = [];
  if (f.status) conds.push(eq(bills.status, f.status));
  if (f.brandId) conds.push(eq(bills.brandId, f.brandId));
  const q = f.search?.trim();
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
    conds.push(or(ilike(bills.billNo, like), ilike(bills.poNo, like), ilike(vendors.name, like), ilike(bills.note, like))!);
  }
  const rows = await db
    .select({
      id: bills.id, billNo: bills.billNo, poNo: bills.poNo, vendorId: bills.vendorId, vendorName: vendors.name, brandId: bills.brandId,
      brandName: brands.name, month: bills.month, billDate: bills.billDate, amount: bills.amount, vatAmount: bills.vatAmount,
      status: bills.status, paidAt: bills.paidAt, note: bills.note, source: bills.source, updatedAt: bills.updatedAt,
      openReminderId: sql<number | null>`(select min(${reminders.id}) from ${reminders} where ${reminders.billId} = ${bills.id} and ${reminders.resolvedAt} is null)`,
    })
    .from(bills)
    .leftJoin(vendors, eq(bills.vendorId, vendors.id))
    .leftJoin(brands, eq(bills.brandId, brands.id))
    .where(conds.length ? and(...conds) : undefined);
  const out = rows.map((r) => {
    const ageDays = r.status === "payment_done" ? null : billAgeDays(r.billDate, today);
    return { ...r, openReminderId: r.openReminderId === null ? null : Number(r.openReminderId), ageDays, bucket: ageBucket(ageDays, t) };
  });
  const filtered = f.age ? out.filter((r) => (f.age === "paid" ? r.status === "payment_done" : r.bucket === f.age)) : out;
  // Unpaid first, oldest bill first; then paid, latest payment first.
  return filtered.sort((a, b) => {
    const ap = a.status === "payment_done", bp = b.status === "payment_done";
    if (ap !== bp) return ap ? 1 : -1;
    if (!ap) return a.billDate.localeCompare(b.billDate) || a.billNo.localeCompare(b.billNo);
    return (b.paidAt ?? "").localeCompare(a.paidAt ?? "") || a.billNo.localeCompare(b.billNo);
  });
}
export type BillView = Awaited<ReturnType<typeof listBills>>[number];

type Tally = { count: number; amount: number };
export type BillSummary = { fresh: Tally; yellow: Tally; red: Tally; unpaid: Tally; paidThisMonth: Tally };

export async function billSummary(db: Db, today: string): Promise<BillSummary> {
  const all = await listBills(db, today);
  const tally = (rows: BillView[]) => ({ count: rows.length, amount: rows.reduce((s, r) => s + r.amount, 0) });
  const unpaid = all.filter((r) => r.status !== "payment_done");
  return {
    fresh: tally(unpaid.filter((r) => r.bucket === "fresh")),
    yellow: tally(unpaid.filter((r) => r.bucket === "yellow")),
    red: tally(unpaid.filter((r) => r.bucket === "red")),
    unpaid: tally(unpaid),
    paidThisMonth: tally(all.filter((r) => r.status === "payment_done" && r.paidAt?.slice(0, 7) === today.slice(0, 7))),
  };
}

export async function listOpenReminders(db: Db, today: string) {
  const rows = await db
    .select({ id: reminders.id, billId: bills.id, billNo: bills.billNo, vendorName: vendors.name, amount: bills.amount, billDate: bills.billDate, createdAt: reminders.createdAt })
    .from(reminders)
    .innerJoin(bills, eq(reminders.billId, bills.id))
    .leftJoin(vendors, eq(bills.vendorId, vendors.id))
    .where(isNull(reminders.resolvedAt))
    .orderBy(bills.billDate);
  return rows.map((r) => ({ ...r, ageDays: billAgeDays(r.billDate, today) }));
}
export type ReminderView = Awaited<ReturnType<typeof listOpenReminders>>[number];

export async function billHistory(db: Db, id: number) {
  return db.select().from(historyLog).where(and(eq(historyLog.entity, "bill"), eq(historyLog.entityId, String(id)))).orderBy(desc(historyLog.id));
}

/** Adds a reminder for every unpaid bill at red age that has none open. Returns how many were added. */
export async function remindOverdue(db: Db, today: string): Promise<number> {
  const due = (await listBills(db, today, { age: "red" })).filter((b) => !b.openReminderId);
  for (const b of due) await remindBill(db, b.id);
  return due.length;
}
