import { test, expect } from "@playwright/test";
import * as XLSX from "xlsx";
import { readFile } from "node:fs/promises";

async function downloadSheet(page: import("@playwright/test").Page, url: string) {
  await page.goto(url);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Export to Excel" }).click()]);
  const wb = XLSX.read(await readFile(await download.path()), { type: "buffer" });
  return { name: download.suggestedFilename(), wb };
}

test("Spend and Billing export the filtered table to Excel", async ({ page }) => {
  const spend = await downloadSheet(page, "/spend?month=2031-01&group=TV");
  expect(spend.name).toBe("aci-spend-2031-01.xlsx");
  expect(spend.wb.SheetNames).toEqual(["Spend by month", "Entries"]);
  expect(XLSX.utils.sheet_to_json<unknown[]>(spend.wb.Sheets["Spend by month"], { header: 1 })[0]).toEqual(
    ["Brand", "October 2030", "November 2030", "December 2030", "January 2031", "Total (BDT)"],
  );

  const bills = await downloadSheet(page, "/billing?age=red");
  expect(bills.name).toMatch(/^aci-bills-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(bills.wb.Sheets.Bills);
  expect(rows.every((r) => r.Status !== "Payment Done" && Number(r["Age (days)"]) >= 30)).toBe(true);
});
