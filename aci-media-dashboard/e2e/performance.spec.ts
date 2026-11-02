import { test, expect } from "@playwright/test";
import * as XLSX from "xlsx";
import { TEMPLATES } from "../src/lib/upload/templates";

function perfXlsx(brand: string): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    TEMPLATES.performance.columns.map((c) => c.header),
    ["2031-02", brand, "Press", 300_000, 900_000, null, null, null, null, null],
  ]), "Performance");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

test("enter channel results, compare cost per 1,000 reached, upload more", async ({ page }) => {
  const stamp = Date.now();
  const brand = `E2E Perf Brand ${stamp}`;

  await page.goto("/settings");
  await page.getByLabel("Brand name").fill(brand);
  await page.getByRole("button", { name: "Add brand" }).click();
  await expect(page.getByTestId(`brand-${brand}`)).toBeVisible();

  await page.goto("/performance?month=2031-02");
  const filters = page.getByRole("form", { name: "Filters" });
  await filters.getByLabel("Brand").selectOption({ label: brand });
  await filters.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/brand=\d+/);

  await page.getByRole("button", { name: "Enter results" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Results brand")).toHaveValue(/\d+/);
  await dialog.getByLabel("TV spend").fill("4,000,000");
  await dialog.getByLabel("TV people reached").fill("2,000,000");
  await dialog.getByLabel("TV GRP").fill("310");
  await dialog.getByLabel("Meta spend").fill("500,000");
  await dialog.getByLabel("Meta people reached").fill("1,000,000");
  await dialog.getByRole("button", { name: "Save results" }).click();
  await expect(dialog).toBeHidden();

  const chart = page.getByTestId("reach-chart");
  await expect(chart.getByTestId("reach-chart-META")).toContainText("500 BDT");
  await expect(chart.getByTestId("reach-chart-META")).toContainText("Best value");
  await expect(chart.getByTestId("reach-chart-TV")).toContainText("2,000 BDT");
  await expect(chart.getByTestId("reach-chart-PRESS")).toContainText("No data");
  await expect(page.getByTestId("tv-numbers")).toContainText("310");
  await expect(page.getByTestId("performance-entries")).toContainText(brand);

  await page.getByRole("navigation", { name: "Channels" }).getByRole("link", { name: "Digital" }).click();
  await expect(page.getByTestId("reach-chart-META")).toBeVisible();
  await expect(page.getByTestId("reach-chart-TV")).toHaveCount(0);
  await page.getByRole("navigation", { name: "Channels" }).getByRole("link", { name: "Both" }).click();

  const panel = page.getByTestId("upload-performance");
  await panel.getByLabel("Choose Channel performance file").setInputFiles({
    name: `e2e-perf-${stamp}.xlsx`, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: perfXlsx(brand),
  });
  await expect(panel.getByRole("list", { name: "Upload checks" })).toContainText("February 2031");
  await panel.getByRole("button", { name: "Confirm and save" }).click();
  await expect(page.getByText(/Saved as version \d+: 1 added/)).toBeVisible();
  await expect(page.getByTestId("reach-chart-PRESS")).toContainText("333 BDT");
  await expect(page.getByTestId("reach-chart-PRESS")).toContainText("Best value");
  await expect(page.getByTestId("best-channel")).toContainText("Press");
});
