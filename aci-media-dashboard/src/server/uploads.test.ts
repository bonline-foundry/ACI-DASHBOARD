import { describe, it, expect, beforeEach } from "vitest";
import * as XLSX from "xlsx";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/test-db";
import { seedReferenceData } from "@/db/seed";
import type { Db } from "@/db/types";
import { campaigns, historyLog, spendEntries, tvStations, vendors } from "@/db/schema";
import { TEMPLATES, type UploadKind } from "@/lib/upload/templates";
import { createBrand, listBusinesses } from "./master-data";
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
