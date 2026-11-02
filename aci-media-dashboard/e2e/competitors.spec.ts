import { test, expect } from "@playwright/test";
import * as XLSX from "xlsx";
import { TEMPLATES } from "../src/lib/upload/templates";

function mediaXlsx(brand: string): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    TEMPLATES.competitor_media.columns.map((c) => c.header),
    ["2026-10", brand, "Rival A", "TV", 1_000_000, 10, null],
  ]), "Competitors");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

test("compare a brand with its rivals, log an ad, save a YouTube snapshot and a source owner", async ({ page }) => {
  const stamp = Date.now();
  const brand = `E2E Comp Brand ${stamp}`;

  await page.goto("/settings");
  await page.getByLabel("Brand name").fill(brand);
  await page.getByRole("button", { name: "Add brand" }).click();
  const row = page.getByTestId(`brand-${brand}`);
  for (const rival of ["Rival A", "Rival B"]) {
    await row.getByLabel(`Rival for ${brand}`).fill(rival);
    await row.getByRole("button", { name: "Add rival" }).click();
    await expect(row.getByText(rival)).toBeVisible();
  }

  await page.goto("/competitors?month=2026-10");
  const filters = page.getByRole("form", { name: "Filters" });
  await filters.getByLabel("Brand").selectOption({ label: brand });
  await filters.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByTestId("rivals-line")).toContainText(`${brand} vs Rival A, Rival B`);

  // Own TV spend by hand
  await page.getByRole("button", { name: "Add row" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Media name").selectOption({ label: brand });
  await dialog.getByLabel("Media spend").fill("3,000,000");
  await dialog.getByLabel("Media spots").fill("30");
  await dialog.getByRole("button", { name: "Save row" }).click();
  await expect(dialog).toBeHidden();

  // Rival TV spend by upload
  const panel = page.getByTestId("upload-competitor_media");
  await panel.getByLabel("Choose Competitor TV, Press and Radio file").setInputFiles({
    name: `e2e-comp-${stamp}.xlsx`, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: mediaXlsx(brand),
  });
  await panel.getByRole("button", { name: "Confirm and save" }).click();
  await expect(page.getByText(/Saved as version \d+: 1 added/)).toBeVisible();

  const sov = page.getByTestId("share-of-voice");
  await expect(sov.getByTestId("share-of-voice-own")).toContainText("75.0%");
  await expect(sov).toContainText("25.0%");
  await expect(page.getByTestId("media-by-subject")).toContainText("3.00");

  // Ad log
  await page.getByRole("button", { name: "Add ad" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Ad rival").selectOption({ label: "Rival B" });
  await dialog.getByLabel("Ad platform choice").selectOption("TikTok");
  await dialog.getByLabel("Ad link").fill("https://www.tiktok.com/@rival/video/1");
  await dialog.getByLabel(/^Ad Hook/).fill("Kills 99.9% germs");
  await dialog.getByRole("button", { name: "Save ad" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("ad-log")).toContainText("Kills 99.9% germs");
  await page.getByRole("group", { name: "Ad platform" }).getByRole("button", { name: "Meta" }).click();
  await expect(page.getByTestId("ad-log")).toHaveCount(0);
  await page.getByRole("group", { name: "Ad platform" }).getByRole("button", { name: "All" }).click();

  // YouTube snapshot
  await page.getByRole("button", { name: "Update snapshot" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel(`${brand} subscribers`).fill("12,500");
  await dialog.getByLabel("Rival A subscribers").fill("40,000");
  await dialog.getByRole("button", { name: "Save snapshot" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("youtube-snapshot")).toContainText("12,500");

  // Source owner
  const source = page.getByTestId("source-tiktok_ads");
  await expect(source).toContainText("Up to date");
  await source.getByLabel("TikTok ad log owner").fill("E2E Owner");
  await source.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Owner saved")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("source-tiktok_ads").getByLabel("TikTok ad log owner")).toHaveValue("E2E Owner");
});
