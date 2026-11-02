import { describe, it, expect, beforeEach } from "vitest";
import * as XLSX from "xlsx";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/test-db";
import { seedReferenceData } from "@/db/seed";
import type { Db } from "@/db/types";
import { bills, campaigns, competitorMedia, digitalEntries, historyLog, performanceEntries, spendEntries, tvStations, vendors } from "@/db/schema";
import { TEMPLATES, type UploadKind } from "@/lib/upload/templates";
import { addRival, createBrand, listBusinesses } from "./master-data";
import { confirmUpload, listUploads, previewUpload, restoreUpload } from "./uploads";

let db: Db;
let brandId: number;

function xlsx(kind: UploadKind, rows: unknown[][]): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([TEMPLATES[kind].columns.map((c) => c.header), ...rows]), "S");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}

// Month, Date, Brand, Channel, TV station, Agency or vendor, Amount, Note
const spendFile = (amountTv = 4_430_000, total: number | null = null) =>
  xlsx("spend", [
    ["2026-10", null, "Savlon Soap", "TV", "ATN News", "Asiatic", amountTv, null],
    ["2026-10", null, "savlon soap", "Facebook", null, "Asiatic", 1_000_000, "boost"],
    ...(total === null ? [] : [["TOTAL", null, null, null, null, null, total, null]]),
  ]);

beforeEach(async () => {
  db = await createTestDb();
  await seedReferenceData(db);
  brandId = (await createBrand(db, { name: "Savlon Soap", businessId: (await listBusinesses(db))[0].id })).id;
});

describe("previewUpload", () => {
  it("passes a clean file and lists new vendors and TV stations", async () => {
    const p = await previewUpload(db, { kind: "spend", fileName: "oct.xlsx", data: spendFile() });
    expect(p.ok).toBe(true);
    expect(p.rowCount).toBe(2);
    expect(p.periods).toEqual(["2026-10"]);
    expect(p.missing).toEqual({ vendors: ["Asiatic"], tvStations: ["ATN News"] });
    expect(p.checks.find((c) => c.label.startsWith("New names"))?.status).toBe("review");
    expect(p.totals.status).toBe("no-control");
  });

  it("fails on bad type, missing columns, unknown brand and row errors", async () => {
    expect((await previewUpload(db, { kind: "spend", fileName: "oct.pdf", data: spendFile() })).ok).toBe(false);
    const cols = await previewUpload(db, { kind: "spend", fileName: "x.xlsx", data: xlsx("plan", []) });
    expect(cols.ok).toBe(false);
    const bad = await previewUpload(db, {
      kind: "spend", fileName: "x.xlsx",
      data: xlsx("spend", [["2026-10", null, "Nope Brand", "Telepathy", null, null, "abc", null]]),
    });
    expect(bad.ok).toBe(false);
    expect(bad.errors.map((e) => e.column).sort()).toEqual(["Amount (BDT, with VAT)", "Brand", "Channel"]);
  });

  it("flags a total mismatch for review", async () => {
    const p = await previewUpload(db, { kind: "spend", fileName: "oct.xlsx", data: spendFile(4_430_000, 6_130_000) });
    expect(p.ok).toBe(true);
    expect(p.totals).toMatchObject({ status: "mismatch", diff: 700_000 });
    expect(p.checks.find((c) => c.label.startsWith("Totals"))?.status).toBe("review");
  });
});

describe("confirmUpload", () => {
  it("saves rows, creates missing names, logs history and blocks duplicates", async () => {
    const res = await confirmUpload(db, { kind: "spend", fileName: "oct.xlsx", data: spendFile(), acceptMismatch: false });
    expect(res).toMatchObject({ inserted: 2, skippedManual: 0 });
    const rows = await db.select().from(spendEntries);
    expect(rows.every((r) => r.source === "upload" && r.uploadId === res.uploadId)).toBe(true);
    expect((await db.select().from(vendors)).map((v) => v.name)).toEqual(["Asiatic"]);
    expect((await db.select().from(tvStations)).map((v) => v.name)).toEqual(["ATN News"]);
    expect((await db.select().from(historyLog)).some((h) => h.entity === "upload" && h.action === "upload")).toBe(true);

    const dup = await previewUpload(db, { kind: "spend", fileName: "copy.xlsx", data: spendFile() });
    expect(dup.ok).toBe(false);
    await expect(confirmUpload(db, { kind: "spend", fileName: "copy.xlsx", data: spendFile(), acceptMismatch: false })).rejects.toThrow(/already uploaded/);
  });

  it("saves a TOTAL row with decimals (VAT) by rounding it to whole taka", async () => {
    const res = await confirmUpload(db, { kind: "spend", fileName: "vat.xlsx", data: spendFile(4_430_000, 5_430_000.4), acceptMismatch: false });
    expect(res.inserted).toBe(2);
    const [up] = await listUploads(db);
    expect(up).toMatchObject({ controlTotal: 5_430_000, rowsTotal: 5_430_000 });
  });

  it("requires accepting a total mismatch", async () => {
    const data = spendFile(4_430_000, 9_999_999);
    await expect(confirmUpload(db, { kind: "spend", fileName: "o.xlsx", data, acceptMismatch: false })).rejects.toThrow(/Totals differ/);
    await expect(confirmUpload(db, { kind: "spend", fileName: "o.xlsx", data, acceptMismatch: true })).resolves.toMatchObject({ inserted: 2 });
  });

  it("keeps manual rows, replaces older upload rows and supersedes the older version", async () => {
    const first = await confirmUpload(db, { kind: "spend", fileName: "v1.xlsx", data: spendFile(1_000), acceptMismatch: false });
    // A manual edit on the Facebook row: same key, source manual
    const fbRow = (await db.select().from(spendEntries)).find((r) => r.note === "boost")!;
    await db.insert(spendEntries).values({ ...fbRow, id: undefined, source: "manual", uploadId: null, amount: 5 });
    await db.delete(spendEntries).where(eq(spendEntries.id, fbRow.id));

    const second = await confirmUpload(db, { kind: "spend", fileName: "v2.xlsx", data: spendFile(2_000), acceptMismatch: false });
    expect(second).toMatchObject({ inserted: 1, skippedManual: 1 });
    const rows = await db.select().from(spendEntries);
    expect(rows.map((r) => [r.source, r.amount]).sort()).toEqual([["manual", 5], ["upload", 2_000]]);

    const ups = await listUploads(db);
    expect(ups.find((u) => u.id === first.uploadId)?.status).toBe("superseded");
    expect(ups.find((u) => u.id === second.uploadId)?.status).toBe("confirmed");

    await restoreUpload(db, first.uploadId);
    const after = await db.select().from(spendEntries);
    expect(after.map((r) => [r.source, r.amount]).sort()).toEqual([["manual", 5], ["upload", 1_000]]);
    const ups2 = await listUploads(db);
    expect(ups2.find((u) => u.id === first.uploadId)?.status).toBe("confirmed");
    expect(ups2.find((u) => u.id === second.uploadId)?.status).toBe("superseded");
    expect((await db.select().from(historyLog)).some((h) => h.action === "restore")).toBe(true);
  });
});

describe("plan uploads", () => {
  it("groups channel rows into campaigns", async () => {
    const data = xlsx("plan", [
      ["Puja burst", "Savlon Soap", "2026-10-01", "2026-10-20", "Live", "TV", 2_000_000, null],
      ["Puja burst", "Savlon Soap", "2026-10-01", "2026-10-20", "Live", "Press", 500_000, null],
      ["Winter", "Savlon Soap", "2026-11-01", "2026-11-30", null, "YouTube", 300_000, "note"],
    ]);
    const p = await previewUpload(db, { kind: "plan", fileName: "plan.xlsx", data });
    expect(p.ok).toBe(true);
    expect(p.periods).toEqual(["2026-10", "2026-11"]);
    const res = await confirmUpload(db, { kind: "plan", fileName: "plan.xlsx", data, acceptMismatch: false });
    expect(res.inserted).toBe(2);
    const rows = await db.select().from(campaigns);
    expect(rows.map((r) => [r.name, r.status, r.source]).sort()).toEqual([["Puja burst", "live", "upload"], ["Winter", "planned", "upload"]]);
    const [puja] = rows.filter((r) => r.name === "Puja burst");
    expect(puja.brandId).toBe(brandId);
  });
});

describe("performance uploads", () => {
  // Month, Brand, Channel, Spend, People reached, GRP, SOV %, SOS %, 1+ reach %, CPRP
  const perfFile = (tvSpend: number, extra: unknown[][] = []) => xlsx("performance", [
    ["2026-10", "Savlon Soap", "TV", tvSpend, 2_000_000, 310, 22.5, 18, 61, 12_900],
    ["2026-10", "Savlon Soap", "Facebook", 1_000_000, 4_000_000, null, null, null, null, null],
    ...extra,
  ]);

  it("saves rows and keeps a manual row on re-upload", async () => {
    const res = await confirmUpload(db, { kind: "performance", fileName: "p1.xlsx", data: perfFile(4_000_000), acceptMismatch: false });
    expect(res.inserted).toBe(2);
    const tv = (await db.select().from(performanceEntries)).find((r) => r.grp !== null)!;
    expect(tv).toMatchObject({ spend: 4_000_000, peopleReached: 2_000_000, grp: 310, shareOfVoice: 22.5, source: "upload" });
    await db.update(performanceEntries).set({ source: "manual", spend: 1 }).where(eq(performanceEntries.id, tv.id));

    const again = await confirmUpload(db, { kind: "performance", fileName: "p2.xlsx", data: perfFile(5_000_000), acceptMismatch: false });
    expect(again).toMatchObject({ inserted: 1, skippedManual: 1 });
    expect((await db.select().from(performanceEntries)).map((r) => [r.source, r.spend]).sort()).toEqual([["manual", 1], ["upload", 1_000_000]]);
  });

  it("fails on repeated channels and TV-only numbers on other channels", async () => {
    const p = await previewUpload(db, {
      kind: "performance", fileName: "bad.xlsx",
      data: perfFile(4_000_000, [
        ["2026-10", "Savlon Soap", "television", 1, null, null, null, null, null, null],
        ["2026-10", "Savlon Soap", "Press", 1, null, 50, null, null, null, null],
      ]),
    });
    expect(p.ok).toBe(false);
    expect(p.errors.map((e) => e.message)).toEqual(["Same brand, month and channel as row 2", "GRP is only for TV"]);
  });
});

describe("digital uploads", () => {
  // Month, Brand, Platform, Spend, Reach, Impressions, CPM, ThruPlays, Cost per view, Engagement
  it("saves Meta, YouTube and TikTok rows and rejects other platforms", async () => {
    const good = xlsx("digital", [
      ["2026-10", "Savlon Soap", "Facebook", 50_000, 400_000, 1_000_000, null, 25_000, null, 3_200],
      ["2026-10", "Savlon Soap", "YouTube", 20_000, 150_000, null, null, 40_000, 0.5, null],
      ["2026-10", "Savlon Soap", "tiktok", null, 90_000, null, null, null, null, 800],
    ]);
    const res = await confirmUpload(db, { kind: "digital", fileName: "d.xlsx", data: good, acceptMismatch: false });
    expect(res.inserted).toBe(3);
    expect((await db.select().from(digitalEntries)).every((r) => r.source === "upload")).toBe(true);

    const bad = await previewUpload(db, { kind: "digital", fileName: "b.xlsx", data: xlsx("digital", [["2026-10", "Savlon Soap", "TV", 1, null, null, null, null, null, null]]) });
    expect(bad.ok).toBe(false);
    expect(bad.errors[0]).toMatchObject({ column: "Platform" });
  });
});

describe("competitor media uploads", () => {
  // Month, Brand, Brand or rival name, Media, Spend, Spots, Share of voice %
  it("matches the brand itself and its rivals, keeps manual rows, rejects unknown rivals and repeats", async () => {
    const dettol = await addRival(db, { brandId, name: "Dettol" });
    const file = (dettolSpend: number) => xlsx("competitor_media", [
      ["2026-10", "Savlon Soap", "savlon soap", "TV", 3_000_000, 40, 35],
      ["2026-10", "Savlon Soap", "Dettol", "Print", dettolSpend, 6, null],
    ]);
    const res = await confirmUpload(db, { kind: "competitor_media", fileName: "c1.xlsx", data: file(1_000), acceptMismatch: false });
    expect(res.inserted).toBe(2);
    let rows = await db.select().from(competitorMedia);
    expect(rows.map((r) => [r.rivalId, r.media, r.spend]).sort()).toEqual([[dettol.id, "Press", 1_000], [null, "TV", 3_000_000]].sort());

    await db.update(competitorMedia).set({ source: "manual", spend: 7 }).where(eq(competitorMedia.rivalId, dettol.id));
    expect(await confirmUpload(db, { kind: "competitor_media", fileName: "c2.xlsx", data: file(2_000), acceptMismatch: false }))
      .toMatchObject({ inserted: 1, skippedManual: 1 });
    rows = await db.select().from(competitorMedia);
    expect(rows.find((r) => r.rivalId === dettol.id)?.spend).toBe(7);

    const bad = await previewUpload(db, { kind: "competitor_media", fileName: "b.xlsx", data: xlsx("competitor_media", [
      ["2026-10", "Savlon Soap", "Lifebuoy", "TV", 1, null, null],
      ["2026-10", "Savlon Soap", "Dettol", "OOH", 1, null, null],
      ["2026-10", "Savlon Soap", "Dettol", "TV", 1, null, null],
      ["2026-10", "Savlon Soap", "dettol", "television", 2, null, null],
    ]) });
    expect(bad.ok).toBe(false);
    expect(bad.errors.map((e) => e.row)).toEqual([2, 3, 5]);
  });
});

describe("bill uploads", () => {
  // Bill no, PO no, Vendor, Brand, Month, Bill date, Amount, VAT, Status, Paid on, Note
  it("reads status words, adds vendors, keeps manual bills and replaces the same bill no", async () => {
    const oct = xlsx("bills", [
      ["B-100", "PO-1", "Asiatic", "Savlon Soap", "2026-10", "2026-10-02", 500_000, 65_217, "Cheque in hand", null, null],
      ["B-101", null, "Mindshare", null, "2026-10", "2026-10-09", 200_000, null, "paid", "2026-10-30", null],
      ["B-102", null, "Asiatic", null, "2026-10", "2026-10-11", 90_000, null, null, null, "check VAT"],
    ]);
    expect((await confirmUpload(db, { kind: "bills", fileName: "oct.xlsx", data: oct, acceptMismatch: false })).inserted).toBe(3);
    let rows = await db.select().from(bills);
    expect(rows.map((r) => [r.billNo, r.status, r.paidAt]).sort()).toEqual([
      ["B-100", "cheque_in_hand", null], ["B-101", "payment_done", "2026-10-30"], ["B-102", "unpaid", null],
    ]);
    expect((await db.select().from(vendors)).map((v) => v.name).sort()).toEqual(["Asiatic", "Mindshare"]);

    await db.update(bills).set({ source: "manual", note: "kept" }).where(eq(bills.billNo, "B-102"));
    // November file repeats B-100 (moved month) and B-102 (manual, so skipped)
    const nov = xlsx("bills", [
      ["b-100", null, "Asiatic", null, "2026-11", "2026-11-01", 510_000, null, "Unpaid", null, null],
      ["B-102", null, "Asiatic", null, "2026-11", "2026-11-01", 1, null, null, null, null],
    ]);
    expect(await confirmUpload(db, { kind: "bills", fileName: "nov.xlsx", data: nov, acceptMismatch: false })).toMatchObject({ inserted: 1, skippedManual: 1 });
    rows = await db.select().from(bills);
    expect(rows.map((r) => [r.billNo, r.month, r.amount]).sort()).toEqual([
      ["B-101", "2026-10", 200_000], ["B-102", "2026-10", 90_000], ["b-100", "2026-11", 510_000],
    ]);

    const bad = await previewUpload(db, { kind: "bills", fileName: "bad.xlsx", data: xlsx("bills", [
      ["B-1", null, null, null, "2026-10", "2026-10-02", 10, null, "lost", null, null],
      ["B-2", null, null, null, "2026-10", "2026-10-02", 10, 20, null, null, null],
      ["B-3", null, null, null, "2026-10", "2026-10-02", 10, null, null, null, null],
      ["b-3", null, null, null, "2026-10", "2026-10-02", 10, null, null, null, null],
    ]) });
    expect(bad.errors.map((e) => [e.row, e.column])).toEqual([[2, "Status"], [3, "Bill"], [5, "Bill no"]]);
  });
});
