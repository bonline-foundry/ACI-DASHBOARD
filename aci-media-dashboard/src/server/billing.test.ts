import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { seedReferenceData } from "@/db/seed";
import type { Db } from "@/db/types";
import { bills } from "@/db/schema";
import { ValidationError } from "./errors";
import { createBrand, createVendor, listBusinesses, setThresholds } from "./master-data";
import {
  billHistory, billSummary, deleteBill, remindOverdue, listBills, listOpenReminders, markBillPaid, parseBillStatus, remindBill, resolveReminder,
  saveBill, setBillNote, type BillInput,
} from "./billing";

let db: Db;
let savlon: number;
let asiatic: number;
const TODAY = "2026-11-02";

beforeEach(async () => {
  db = await createTestDb();
  await seedReferenceData(db);
  savlon = (await createBrand(db, { name: "Savlon Soap", businessId: (await listBusinesses(db))[0].id })).id;
  asiatic = (await createVendor(db, { name: "Asiatic", kind: "agency" })).id;
});

const bill = (patch: Partial<BillInput> = {}): BillInput =>
  ({ billNo: "B-1", vendorId: asiatic, brandId: savlon, month: "2026-10", billDate: "2026-10-01", amount: 100_000, ...patch });

describe("parseBillStatus", () => {
  it("reads labels and short words", () => {
    expect(["Payment Done", "paid", "Cheque in hand", "cheque in counter", "Finance/Audit", "audit", "bill error", "", null, "lost"].map(parseBillStatus))
      .toEqual(["payment_done", "payment_done", "cheque_in_hand", "cheque_in_counter", "finance_audit", "finance_audit", "bill_error", "unpaid", "unpaid", null]);
  });
});

describe("saveBill", () => {
  it.each([
    ["no bill no", { billNo: " " }],
    ["bad month", { month: "Oct" }],
    ["bad date", { billDate: "2026-02-30" }],
    ["negative amount", { amount: -1 }],
    ["fraction", { amount: 10.5 }],
    ["VAT above amount", { vatAmount: 200_000 }],
    ["unknown vendor", { vendorId: 9999 }],
    ["unknown brand", { brandId: 9999 }],
    ["paid before billed", { status: "payment_done", paidAt: "2026-09-01" }],
  ])("rejects %s", async (_l, patch: Partial<BillInput>) => {
    await expect(saveBill(db, null, bill(patch))).rejects.toThrow(ValidationError);
  });

  it("blocks a bill number that already exists in any case", async () => {
    await saveBill(db, null, bill());
    await expect(saveBill(db, null, bill({ billNo: "b-1" }))).rejects.toThrow(/already exists/);
  });

  it("sets paid date when paid and clears it when moved back", async () => {
    const b = await saveBill(db, null, bill({ status: "payment_done" }));
    expect(b.paidAt).not.toBeNull();
    const back = await saveBill(db, b.id, bill({ status: "finance_audit", paidAt: "2026-10-05" }));
    expect(back).toMatchObject({ status: "finance_audit", paidAt: null, source: "manual" });
  });
});

describe("actions on bills", () => {
  it("reminds once, mark paid closes reminders, notes and history are kept", async () => {
    const b = await saveBill(db, null, bill());
    await db.update(bills).set({ source: "upload" });
    await remindBill(db, b.id);
    await remindBill(db, b.id);
    let open = await listOpenReminders(db, TODAY);
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ billNo: "B-1", vendorName: "Asiatic", ageDays: 32 });

    await setBillNote(db, b.id, "  Sent to finance  ");
    await expect(markBillPaid(db, b.id, "2026-09-01")).rejects.toThrow(ValidationError);
    await markBillPaid(db, b.id, "2026-11-01");
    open = await listOpenReminders(db, TODAY);
    expect(open).toHaveLength(0);
    const [row] = await listBills(db, TODAY);
    expect(row).toMatchObject({ status: "payment_done", paidAt: "2026-11-01", note: "Sent to finance", ageDays: null, bucket: null, source: "manual" });
    expect((await billHistory(db, b.id)).map((h) => h.action)).toEqual(["update", "update", "create"]);
  });

  it("resolves a reminder by hand and deletes a bill", async () => {
    const b = await saveBill(db, null, bill());
    await remindBill(db, b.id);
    const [r] = await listOpenReminders(db, TODAY);
    await resolveReminder(db, r.id);
    expect(await listOpenReminders(db, TODAY)).toHaveLength(0);
    await deleteBill(db, b.id);
    expect(await listBills(db, TODAY)).toHaveLength(0);
  });
});

describe("listing and summary", () => {
  beforeEach(async () => {
    await saveBill(db, null, bill({ billNo: "OLD-1", billDate: "2026-09-20", amount: 300 }));             // 43 days
    await saveBill(db, null, bill({ billNo: "MID-1", billDate: "2026-10-15", amount: 200, poNo: "PO-77" })); // 18 days
    await saveBill(db, null, bill({ billNo: "NEW-1", billDate: "2026-10-30", amount: 100, brandId: null })); // 3 days
    await saveBill(db, null, bill({ billNo: "PAID-1", billDate: "2026-09-01", amount: 50, status: "payment_done", paidAt: "2026-11-01" }));
    await saveBill(db, null, bill({ billNo: "PAID-OLD", billDate: "2026-08-01", amount: 70, status: "payment_done", paidAt: "2026-10-01" }));
  });

  it("filters by age, status, brand and search, oldest unpaid first", async () => {
    expect((await listBills(db, TODAY)).map((b) => b.billNo)).toEqual(["OLD-1", "MID-1", "NEW-1", "PAID-1", "PAID-OLD"]);
    expect((await listBills(db, TODAY, { age: "red" })).map((b) => b.billNo)).toEqual(["OLD-1"]);
    expect((await listBills(db, TODAY, { age: "yellow" })).map((b) => b.billNo)).toEqual(["MID-1"]);
    expect((await listBills(db, TODAY, { age: "paid" })).map((b) => b.billNo)).toEqual(["PAID-1", "PAID-OLD"]);
    expect((await listBills(db, TODAY, { search: "po-77" })).map((b) => b.billNo)).toEqual(["MID-1"]);
    expect((await listBills(db, TODAY, { search: "asiat" }))).toHaveLength(5);
    expect((await listBills(db, TODAY, { status: "unpaid", brandId: savlon })).map((b) => b.billNo)).toEqual(["OLD-1", "MID-1"]);
  });

  it("reminds every overdue bill once", async () => {
    expect(await remindOverdue(db, TODAY)).toBe(1);
    expect(await remindOverdue(db, TODAY)).toBe(0);
    expect((await listOpenReminders(db, TODAY)).map((r) => r.billNo)).toEqual(["OLD-1"]);
  });

  it("sums buckets and paid this month, using Settings thresholds", async () => {
    expect(await billSummary(db, TODAY)).toEqual({
      fresh: { count: 1, amount: 100 }, yellow: { count: 1, amount: 200 }, red: { count: 1, amount: 300 },
      unpaid: { count: 3, amount: 600 }, paidThisMonth: { count: 1, amount: 50 },
    });
    await setThresholds(db, { billYellowDays: 2, billRedDays: 10, budgetOrangePct: 90, budgetRedPct: 100 });
    const s = await billSummary(db, TODAY);
    expect([s.fresh.count, s.yellow.count, s.red.count]).toEqual([0, 1, 2]);
  });
});
