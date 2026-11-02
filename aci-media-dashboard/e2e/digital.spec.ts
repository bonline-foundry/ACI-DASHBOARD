import { test, expect } from "@playwright/test";
import * as XLSX from "xlsx";
import { TEMPLATES } from "../src/lib/upload/templates";

function digitalXlsx(brand: string): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    TEMPLATES.digital.columns.map((c) => c.header),
    ["2031-03", brand, "YouTube", 20_000, 150_000, null, null, 40_000, 0.5, null],
  ]), "Digital");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

test("add Meta results by hand, block a duplicate, upload YouTube, delete", async ({ page }) => {
  const stamp = Date.now();
  const brand = `E2E Digital Brand ${stamp}`;

  await page.goto("/settings");
  await page.getByLabel("Brand name").fill(brand);
  await page.getByRole("button", { name: "Add brand" }).click();
  await expect(page.getByTestId(`brand-${brand}`)).toBeVisible();

  await page.goto("/digital?month=2031-03");
  const filters = page.getByRole("form", { name: "Filters" });
  await filters.getByLabel("Brand").selectOption({ label: brand });
  await filters.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/brand=\d+/);

  const addMeta = async () => {
    await page.getByRole("button", { name: "Add results" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Digital platform").selectOption({ label: "Meta" });
    await dialog.getByLabel("Digital spend").fill("50,000");
    await dialog.getByLabel("Digital reach").fill("400,000");
    await dialog.getByLabel("Digital impressions").fill("1,000,000");
    await dialog.getByLabel("Digital ThruPlays").fill("25,000");
    await dialog.getByRole("button", { name: "Save results" }).click();
    return dialog;
  };
  await expect(await addMeta()).toBeHidden();
  const meta = page.getByTestId("platform-META");
  await expect(meta).toContainText("50.00");
  await expect(meta).toContainText("2.00");
  await expect(page.getByTestId("digital-entries")).toContainText(brand);
  await expect(page.getByTestId("platform-TIKTOK")).toContainText("No data");

  const dup = await addMeta();
  await expect(dup.getByRole("alert")).toContainText("already has results");
  await page.keyboard.press("Escape");
  await expect(dup).toBeHidden();

  const panel = page.getByTestId("upload-digital");
  await panel.getByLabel("Choose Digital results file").setInputFiles({
    name: `e2e-digital-${stamp}.xlsx`, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: digitalXlsx(brand),
  });
  await panel.getByRole("button", { name: "Confirm and save" }).click();
  await expect(page.getByText(/Saved as version \d+: 1 added/)).toBeVisible();
  await expect(page.getByTestId("cost-per-view-YOUTUBE")).toContainText("0.50 BDT");
  await expect(page.getByTestId("cost-per-view-YOUTUBE")).toContainText("Best value");
  await expect(page.getByTestId("reach-by-platform-YOUTUBE")).toContainText("1,50,000");

  page.once("dialog", (d) => d.accept());
  await page.getByTestId("digital-entries").getByRole("row", { name: /Meta/ }).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByTestId("platform-META")).toContainText("No data");
});
