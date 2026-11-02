import { test, expect } from "@playwright/test";

test("plan a campaign, see it on timeline, calendar and list, then set a budget", async ({ page }) => {
  const stamp = Date.now();
  const brand = `E2E Plan Brand ${stamp}`;
  const campaign = `E2E Puja ${stamp}`;

  await page.goto("/settings");
  await page.getByLabel("Brand name").fill(brand);
  await page.getByRole("button", { name: "Add brand" }).click();
  await expect(page.getByTestId(`brand-${brand}`)).toBeVisible();

  await page.goto("/plan?month=2026-10");
  await page.getByRole("button", { name: "Add campaign" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Campaign brand").selectOption({ label: brand });
  await dialog.getByLabel("Campaign name").fill(campaign);
  await dialog.getByLabel("Start date").fill("2026-10-22");
  await dialog.getByLabel("End date").fill("2026-11-10");
  await dialog.getByLabel("Channel 1", { exact: true }).selectOption({ label: "TV" });
  await dialog.getByLabel("Amount 1", { exact: true }).fill("1,000,000");
  await dialog.getByRole("button", { name: "Add channel" }).click();
  await dialog.getByLabel("Channel 2", { exact: true }).selectOption({ label: "Meta" });
  await dialog.getByLabel("Amount 2", { exact: true }).fill("200000");
  await expect(dialog.getByText("Total: 12,00,000 BDT (1.20M)")).toBeVisible();
  await dialog.getByRole("button", { name: "Save campaign" }).click();
  await expect(dialog).toBeHidden();

  await expect(page.getByTestId("plan-timeline").getByRole("button", { name: campaign })).toBeVisible();

  await page.getByRole("link", { name: "Calendar" }).click();
  await expect(page.getByTestId("plan-calendar").getByRole("button", { name: `${brand}: ${campaign}` }).first()).toBeVisible();

  await page.getByRole("link", { name: "List" }).click();
  const row = page.getByTestId("plan-list").getByRole("row", { name: new RegExp(campaign) });
  await expect(row).toContainText("1.20");

  // October share: 10 of 20 days → 0.60M planned
  const budgetRow = page.getByTestId(`budget-${brand}`);
  await expect(budgetRow).toContainText("0.60");
  await expect(budgetRow).toContainText("No budget set");

  await page.getByLabel("Budget brand").selectOption({ label: brand });
  await page.getByLabel("Budget amount").fill("500000");
  await page.getByLabel("Budget reason").fill("E2E test budget");
  await page.getByRole("button", { name: "Set budget" }).click();
  await expect(budgetRow).toContainText("0.50");
  await expect(budgetRow).toContainText("Plan over budget");

  // Edit from list and delete
  await row.click();
  await page.once("dialog", (d) => d.accept());
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(campaign)).toHaveCount(0);
});
