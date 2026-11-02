import { test, expect } from "@playwright/test";
import { NAV_ITEMS } from "../src/components/shell/nav-items";

test("sidebar shows all sections", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  for (const item of NAV_ITEMS) await expect(nav.getByRole("link", { name: item.label, exact: true })).toBeVisible();
});

test("add a brand and a rival in settings", async ({ page }) => {
  const brand = `E2E Brand ${Date.now()}`;
  await page.goto("/settings");
  await page.getByLabel("Brand name").fill(brand);
  await page.getByLabel("Business").selectOption({ label: "Hygiene" });
  await page.getByRole("button", { name: "Add brand" }).click();
  const row = page.getByTestId(`brand-${brand}`);
  await expect(row).toBeVisible();
  await row.getByLabel(`Rival for ${brand}`).fill("Rival One");
  await row.getByRole("button", { name: "Add rival" }).click();
  await expect(row.getByText("Rival One")).toBeVisible();
});

test("template download returns an xlsx", async ({ request }) => {
  const res = await request.get("/api/templates/spend");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-disposition"]).toContain("aci-spend-template.xlsx");
});
