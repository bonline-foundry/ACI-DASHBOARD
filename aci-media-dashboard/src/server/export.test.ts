import { describe, it, expect, beforeEach } from "vitest";
import * as XLSX from "xlsx";
import { createTestDb } from "@/db/test-db";
import { seedReferenceData } from "@/db/seed";
import type { Db } from "@/db/types";
import { saveBill } from "./billing";
import { createBrand, createTvStation, listBusinesses } from "./master-data";
import { listChannels } from "./plan";
import { createSpendEntry } from "./spend";
import { billsWorkbook, spendWorkbook } from "./export";

let db: Db;
let savlon: number;
let salt: number;
let ch: Record<string, number>;

beforeEach(async () => {
  db = await createTestDb();
  await seedReferenceData(db);
  const biz = (await listBusinesses(db))[0].id;
  savlon = (await createBrand(db, { name: "Savlon Soap", businessId: biz })).id;
  salt = (await createBrand(db, { name: "ACI Pure Salt", businessId: biz })).id;
  ch = Object.fromEntries((await listChannels(db)).map((c) => [c.code, c.id]));
});

const read = (data: Uint8Array) => {
  const wb = XLSX.read(data, { type: "array" });
  return Object.fromEntries(wb.SheetNames.map((n) => [n, XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, defval: "" })]));
};

describe("spendWorkbook", () => {
  it("writes the 4-month table and the entries of the month, with numbers", async () => {
    const atn = await createTvStation(db, "ATN News");
    await createSpendEntry(db, { brandId: savlon, month: "2026-10", channelId: ch.TV, tvStationId: atn.id, amount: 3_000_000 });
    await createSpendEntry(db, { brandId: savlon, month: "2026-08", channelId: ch.META, amount: 500_000 });
    await createSpendEntry(db, { brandId: salt, month: "2026-10", channelId: ch.PRESS, amount: 200_000, note: "insert" });
    const s = read(await spendWorkbook(db, { month: "2026-10" }));
    expect(Object.keys(s)).toEqual(["Spend by month", "Entries"]);
    expect(s["Spend by month"]).toEqual([
      ["Brand", "July 2026", "August 2026", "September 2026", "October 2026", "Total (BDT)"],
      ["ACI Pure Salt", 0, 0, 0, 200_000, 200_000],
      ["Savlon Soap", 0, 500_000, 0, 3_000_000, 3_500_000],
      ["All brands", 0, 500_000, 0, 3_200_000, 3_700_000],
    ]);
    expect(s.Entries[0]).toEqual(["Month", "Date", "Brand", "Channel", "TV station", "Agency or vendor", "Amount (BDT, with VAT)", "Note", "Source"]);
    expect(s.Entries).toHaveLength(3);
    expect(s.Entries[1]).toEqual(["2026-10", "", "ACI Pure Salt", "Press", "", "", 200_000, "insert", "Manual"]);

    const tvOnly = read(await spendWorkbook(db, { month: "2026-10", brandId: savlon, group: "TV" }));
    expect(tvOnly["Spend by month"].slice(1).map((r) => r[0])).toEqual(["Savlon Soap", "All brands"]);
    expect(tvOnly["Spend by month"][1][5]).toBe(3_000_000);
  });
});

describe("billsWorkbook", () => {
  it("writes the filtered bills with status labels and age", async () => {
    await saveBill(db, null, { billNo: "B-1", month: "2026-09", billDate: "2026-09-20", amount: 300, vatAmount: 39, brandId: savlon });
    await saveBill(db, null, { billNo: "B-2", month: "2026-10", billDate: "2026-10-30", amount: 100, status: "payment_done", paidAt: "2026-11-01" });
    const all = read(await billsWorkbook(db, "2026-11-02", {})).Bills;
    expect(all[0]).toEqual(["Bill no", "PO no", "Vendor", "Brand", "Month", "Bill date", "Amount (BDT, with VAT)", "VAT (BDT)", "Status", "Paid on", "Age (days)", "Note"]);
    expect(all.slice(1)).toEqual([
      ["B-1", "", "", "Savlon Soap", "2026-09", "2026-09-20", 300, 39, "Unpaid", "", 43, ""],
      ["B-2", "", "", "", "2026-10", "2026-10-30", 100, "", "Payment Done", "2026-11-01", "", ""],
    ]);
    expect(read(await billsWorkbook(db, "2026-11-02", { age: "paid" })).Bills).toHaveLength(2);
  });
});
