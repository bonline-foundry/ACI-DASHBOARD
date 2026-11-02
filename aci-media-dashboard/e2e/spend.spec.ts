import { test, expect } from "@playwright/test";
import * as XLSX from "xlsx";
import { TEMPLATES } from "../src/lib/upload/templates";

function spendXlsx(brand: string, station: string, total: number): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    TEMPLATES.spend.columns.map((c) => c.header),
    ["2031-01", null, brand, "TV", station, null, 3_000_000, null],
    ["2031-01", null, brand, "Facebook", null, null, 1_000_000, null],
    ["TOTAL", null, null, null, null, null, total, null],
  ]), "Spend");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

test("upload spend with a total mismatch, see it everywhere, block duplicates, add a manual entry", async ({ page }) => {
  const stamp = Date.now();
  const brand = `E2E Spend Brand ${stamp}`;
  const station = `E2E TV ${stamp}`;
  const file = { name: `e2e-spend-${stamp}.xlsx`, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: spendXlsx(brand, station, 4_700_000) };

  await page.goto("/settings");
  await page.getByLabel("Brand name").fill(brand);
  await page.getByRole("button", { name: "Add brand" }).click();
  await expect(page.getByTestId(`brand-${brand}`)).toBeVisible();

  await page.goto("/spend?month=2031-01");
  await page.waitForLoadState("networkidle");
  const panel = page.getByTestId("upload-spend");
  await panel.getByLabel("Choose Media spend file").setInputFiles(file);
  const checks = panel.getByRole("list", { name: "Upload checks" });
  await expect(checks).toContainText("Month found");
  await expect(checks).toContainText("January 2031");
  await expect(checks).toContainText("Totals differ by 7,00,000 BDT");
  await expect(checks).toContainText(station);

  const confirm = panel.getByRole("button", { name: "Confirm and save" });
  await expect(confirm).toBeDisabled();
  await panel.getByRole("checkbox").check();
  await confirm.click();
  await expect(page.getByText(/Saved as version \d+: 2 added/)).toBeVisible();

  const matrixRow = page.getByTestId("spend-matrix").getByRole("row", { name: new RegExp(brand) });
  await expect(matrixRow).toContainText("4.00");
  await expect(page.getByText(`${station}`).first()).toBeVisible();

  // Same file again is blocked
  await panel.getByLabel("Choose Media spend file").setInputFiles(file);
  await expect(panel.getByRole("list", { name: "Upload checks" })).toContainText("Same file as version");
  await expect(panel.getByRole("button", { name: "Confirm and save" })).toBeDisabled();
  await panel.getByRole("button", { name: "Cancel" }).click();

  // Manual entry adds to the month
  await page.getByRole("button", { name: "Add entry" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Spend brand").selectOption({ label: brand });
  await dialog.getByLabel("Spend channel").selectOption({ label: "OOH" });
  await dialog.getByLabel("Spend amount").fill("500,000");
  await dialog.getByRole("button", { name: "Save entry" }).click();
  await expect(dialog).toBeHidden();
  await expect(matrixRow).toContainText("4.50");

  // Actual spend flows into the Plan budget table
  await page.goto("/plan?month=2031-01");
  await expect(page.getByTestId(`budget-${brand}`)).toContainText("4.50");

  // Uploads page shows the version and the history
  await page.goto("/uploads");
  await expect(page.getByTestId("uploads-table")).toContainText(file.name);
  await expect(page.getByTestId("history-table")).toContainText("Total mismatch accepted");
});
