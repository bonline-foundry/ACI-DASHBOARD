import { test, expect } from "@playwright/test";

// Regression: the Quick actions menu crashed the page (group label outside a menu group).
test("Quick actions opens the new spend entry form, then the URL is cleaned", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Quick actions" }).first().click();
  await expect(page.getByRole("menuitem", { name: "New campaign" })).toBeVisible();
  await page.getByRole("menuitem", { name: "New spend entry" }).click();
  await expect(page).toHaveURL(/\/spend/);
  await expect(page.getByRole("dialog").getByLabel("Spend amount")).toBeVisible();
  await expect(page).not.toHaveURL(/new=entry/);
  expect(errors).toEqual([]);
});
