import { test, expect, type Page } from "@playwright/test";
import * as XLSX from "xlsx";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { addDays, todayDhaka } from "../src/lib/month";
import { TEMPLATES, type UploadKind } from "../src/lib/upload/templates";

// Everything lands on one demo brand in December 2026, so the October demo data is never replaced.
const BRAND = "Live Demo Soap";
const RIVALS = ["Rival One", "Rival Two", "Rival Three"];
const MONTH = "2026-12";
const FILES = path.resolve(__dirname, "../../demo-files");
const TODAY = todayDhaka();
const RUN = new Date().toISOString().slice(0, 16).replace("T", " ");

/** Write a template-shaped Excel file the user can open later, and return its path. */
function excel(kind: UploadKind, name: string, rows: unknown[][]): string {
  mkdirSync(FILES, { recursive: true });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATES[kind].columns.map((c) => c.header), ...rows]);
  ws["!cols"] = TEMPLATES[kind].columns.map((c) => ({ wch: Math.max(14, c.header.length + 2) }));
  XLSX.utils.book_append_sheet(wb, ws, TEMPLATES[kind].title.slice(0, 31));
  const file = path.join(FILES, name);
  XLSX.writeFile(wb, file);
  return file;
}

/** Purple caption at the top of the page so the audience can follow each step. */
async function caption(page: Page, text: string) {
  console.log(`\n▶ ${text}`);
  await page.evaluate((t) => {
    let el = document.getElementById("demo-caption");
    if (!el) {
      el = document.createElement("div");
      el.id = "demo-caption";
      el.setAttribute("style", "position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:9999;background:#5b4fe9;color:#fff;padding:10px 18px;border-radius:999px;font:600 15px system-ui;box-shadow:0 8px 24px rgba(0,0,0,.25);pointer-events:none;max-width:90vw;text-align:center");
      document.body.appendChild(el);
    }
    el.textContent = t;
  }, text);
  await page.waitForTimeout(1200);
}

async function go(page: Page, url: string, text: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  await caption(page, text);
}

const ok = (what: string) => console.log(`   ✓ ${what}`);

/** Open the upload panel, choose the file, read the checks, confirm. Same file twice is blocked as a duplicate. */
async function upload(page: Page, kind: UploadKind, file: string, acceptMismatch = false) {
  const panel = page.getByTestId(`upload-${kind}`);
  await panel.scrollIntoViewIfNeeded();
  await panel.getByRole("button", { name: "Upload Excel" }).click();
  await panel.getByLabel(`Choose ${TEMPLATES[kind].title} file`).setInputFiles(file);
  const checks = panel.getByRole("list", { name: "Upload checks" });
  await expect(checks).toBeVisible();
  await page.waitForTimeout(1500);
  if (await checks.getByText("Same file as version").count()) {
    ok(`${path.basename(file)} was uploaded on an earlier run, so the duplicate check blocked it (expected)`);
    await panel.getByRole("button", { name: "Cancel" }).click();
    return;
  }
  if (acceptMismatch) await panel.getByRole("checkbox").check();
  await panel.getByRole("button", { name: "Confirm and save" }).click();
  await expect(page.getByText(/Saved as version \d+/).first()).toBeVisible();
  ok(`${path.basename(file)} uploaded and saved as a new version`);
}

async function chooseBrand(page: Page) {
  const filters = page.getByRole("form", { name: "Filters" });
  await filters.getByLabel("Brand").selectOption({ label: BRAND });
  await filters.getByRole("button", { name: "Apply" }).click();
  await page.waitForURL(/brand=\d+/);
  await page.waitForLoadState("networkidle");
}

test("ACI Media Dashboard live walkthrough", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await test.step("1. Settings: brand and 3 rivals", async () => {
    await go(page, "/settings", "Step 1 · Settings: add the brand and its 3 rivals");
    if ((await page.getByTestId(`brand-${BRAND}`).count()) === 0) {
      await page.getByLabel("Brand name").fill(BRAND);
      await page.getByLabel("Business").selectOption({ label: "Hygiene" });
      await page.getByRole("button", { name: "Add brand" }).click();
    }
    const row = page.getByTestId(`brand-${BRAND}`);
    await expect(row).toBeVisible();
    for (const rival of RIVALS) {
      const chip = row.getByRole("button", { name: `Remove rival ${rival}` });
      if (await chip.count()) continue;
      await row.getByLabel(`Rival for ${BRAND}`).fill(rival);
      await row.getByRole("button", { name: "Add rival" }).click();
      await expect(chip).toBeVisible();
    }
    ok(`${BRAND} with ${RIVALS.join(", ")}`);
  });

  await test.step("2. Plan: add a campaign by hand", async () => {
    await go(page, `/plan?month=${MONTH}`, "Step 2 · Plan: add a campaign by hand");
    await page.getByRole("button", { name: "Add campaign" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Campaign brand").selectOption({ label: BRAND });
    await d.getByLabel("Campaign name").fill(`Winter Glow launch (${RUN})`);
    await d.getByLabel("Start date").fill("2026-12-05");
    await d.getByLabel("End date").fill("2026-12-24");
    await d.getByLabel("Channel 1", { exact: true }).selectOption({ label: "TV" });
    await d.getByLabel("Amount 1", { exact: true }).fill("3,000,000");
    await d.getByRole("button", { name: "Add channel" }).click();
    await d.getByLabel("Channel 2", { exact: true }).selectOption({ label: "Meta" });
    await d.getByLabel("Amount 2", { exact: true }).fill("800,000");
    await d.getByRole("button", { name: "Save campaign" }).click();
    await expect(d).toBeHidden();
    await expect(page.getByTestId("plan-timeline")).toContainText("Winter Glow launch");
    ok("Campaign shows on the timeline");
  });

  await test.step("3. Plan: upload a campaign plan Excel file", async () => {
    const file = excel("plan", "1-plan-december-2026.xlsx", [
      ["Press insert wave", BRAND, "2026-12-10", "2026-12-12", "Planned", "Press", 450_000, `Demo run ${RUN}`],
      ["YouTube pre-roll", BRAND, "2026-12-01", "2026-12-31", "Planned", "YouTube", 600_000, null],
      ["YouTube pre-roll", BRAND, "2026-12-01", "2026-12-31", "Planned", "TikTok", 250_000, null],
    ]);
    await caption(page, "Step 3 · Plan: upload the campaign plan Excel file");
    await upload(page, "plan", file);
    await page.waitForLoadState("networkidle");
    await go(page, `/plan?month=${MONTH}&view=calendar`, "Step 3 · Plan: calendar view");
    await expect(page.getByTestId("plan-calendar")).toBeVisible();
    await go(page, `/plan?month=${MONTH}&view=list`, "Step 3 · Plan: list view with uploaded campaigns");
    await expect(page.getByTestId("plan-list")).toContainText("YouTube pre-roll");
    ok("Uploaded campaigns show in the list");
  });

  await test.step("4. Plan: set the December budget", async () => {
    await go(page, `/plan?month=${MONTH}`, "Step 4 · Plan: set the December budget");
    await page.getByLabel("Budget brand").selectOption({ label: BRAND });
    await page.getByLabel("Budget amount").fill("6,000,000");
    await page.getByLabel("Budget reason").fill("Approved Q4 plan");
    await page.getByRole("button", { name: "Set budget" }).click();
    await expect(page.getByTestId(`budget-${BRAND}`)).toContainText("6.00");
    ok("Budget 6.00M set");
  });

  await test.step("5. Spend: upload spend Excel and add an entry", async () => {
    const file = excel("spend", "2-spend-december-2026.xlsx", [
      [MONTH, "2026-12-06", BRAND, "TV", "ATN News", "Asiatic", 2_400_000, `Demo run ${RUN}`],
      [MONTH, "2026-12-08", BRAND, "TV", "Channel i", "Asiatic", 1_100_000, null],
      [MONTH, null, BRAND, "Facebook", null, "Mindshare", 650_000, "boost"],
      [MONTH, "2026-12-10", BRAND, "Press", null, "Asiatic", 300_000, null],
      ["TOTAL", null, null, null, null, null, 4_450_000, null],
    ]);
    await go(page, `/spend?month=${MONTH}`, "Step 5 · Spend: upload the spend Excel file (with a TOTAL row)");
    await upload(page, "spend", file);
    await chooseBrand(page);
    await caption(page, "Step 5 · Spend: add an outdoor (OOH) entry by hand");
    await page.getByRole("button", { name: "Add entry" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Spend brand").selectOption({ label: BRAND });
    await d.getByLabel("Spend channel").selectOption({ label: "OOH" });
    await d.getByLabel("Spend amount").fill("200,000");
    await d.getByLabel("Spend note").fill(`Billboard, Gulshan (${RUN})`);
    await d.getByRole("button", { name: "Save entry" }).click();
    await expect(d).toBeHidden();
    await expect(page.getByTestId("spend-matrix")).toContainText(BRAND);
    await caption(page, "Step 5 · Spend: export the table to Excel");
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 30_000 }), page.getByRole("link", { name: "Export to Excel" }).click()]);
    await download.saveAs(path.join(FILES, "exports", download.suggestedFilename()));
    ok(`Spend saved and exported to demo-files/exports/${download.suggestedFilename()}`);
  });

  await test.step("6. Plan: actual spend flows into the budget", async () => {
    await go(page, `/plan?month=${MONTH}`, "Step 6 · Plan: actual spend now shows against the budget");
    await expect(page.getByTestId(`budget-${BRAND}`)).not.toContainText("No budget");
    ok("Budget row shows actual spend and % used");
  });

  await test.step("7. Performance: enter results and upload more", async () => {
    await go(page, `/performance?month=${MONTH}`, "Step 7 · Performance: enter spend and people reached");
    await chooseBrand(page);
    await page.getByRole("button", { name: "Enter results" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("TV spend").fill("3,500,000");
    await d.getByLabel("TV people reached").fill("1,600,000");
    await d.getByLabel("TV GRP").fill("240");
    await d.getByLabel("TV Share of voice %").fill("26");
    await d.getByLabel("Meta spend").fill("650,000");
    await d.getByLabel("Meta people reached").fill("2,100,000");
    await d.getByRole("button", { name: "Save results" }).click();
    await expect(d).toBeHidden();
    const file = excel("performance", "3-performance-december-2026.xlsx", [
      [MONTH, BRAND, "YouTube", 600_000, 1_500_000, null, null, null, null, null],
      [MONTH, BRAND, "Press", 300_000, 180_000, null, null, null, null, null],
    ]);
    await caption(page, "Step 7 · Performance: upload YouTube and Press results");
    await upload(page, "performance", file);
    await expect(page.getByTestId("reach-chart")).toContainText("Best value");
    await caption(page, "Step 7 · Performance: compare TV only, then Digital only");
    await page.getByRole("navigation", { name: "Channels" }).getByRole("link", { name: "TV" }).click();
    await page.waitForLoadState("networkidle");
    await page.getByRole("navigation", { name: "Channels" }).getByRole("link", { name: "Digital" }).click();
    await page.waitForLoadState("networkidle");
    await page.getByRole("navigation", { name: "Channels" }).getByRole("link", { name: "Both" }).click();
    ok(`Best channel: ${(await page.getByTestId("best-channel").textContent())?.trim()}`);
  });

  await test.step("8. Digital Data: add Meta and upload YouTube and TikTok", async () => {
    await go(page, `/digital?month=${MONTH}`, "Step 8 · Digital Data: add Meta results by hand");
    await chooseBrand(page);
    await page.getByRole("button", { name: "Add results" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Digital brand").selectOption({ label: BRAND });
    await d.getByLabel("Digital platform").selectOption({ label: "Meta" });
    await d.getByLabel("Digital spend").fill("650,000");
    await d.getByLabel("Digital reach").fill("2,100,000");
    await d.getByLabel("Digital impressions").fill("5,400,000");
    await d.getByLabel("Digital ThruPlays").fill("310,000");
    await d.getByLabel("Digital engagement").fill("41,000");
    await d.getByRole("button", { name: "Save results" }).click();
    await page.waitForTimeout(2000);
    if (await d.getByRole("alert").count()) {
      ok("Meta results already exist for this month, so the duplicate was blocked (expected on a second run)");
      await page.keyboard.press("Escape");
    }
    await expect(d).toBeHidden();
    const file = excel("digital", "4-digital-december-2026.xlsx", [
      [MONTH, BRAND, "YouTube", 600_000, 1_500_000, 3_900_000, null, 720_000, null, 12_500],
      [MONTH, BRAND, "TikTok", 250_000, 1_100_000, 2_800_000, null, 400_000, null, 36_000],
    ]);
    await caption(page, "Step 8 · Digital Data: upload YouTube and TikTok results");
    await upload(page, "digital", file);
    await expect(page.getByTestId("platform-META")).not.toContainText("No data");
    await expect(page.getByTestId("cost-per-view")).toContainText("Best value");
    ok("Platform cards, reach and cost-per-view charts filled");
  });

  await test.step("9. Competitor Tracking", async () => {
    await go(page, `/competitors?month=${MONTH}`, "Step 9 · Competitors: our own TV spend by hand");
    await chooseBrand(page);
    await expect(page.getByTestId("rivals-line")).toContainText(RIVALS[0]);
    await page.getByRole("button", { name: "Add row" }).click();
    let d = page.getByRole("dialog");
    await d.getByLabel("Media name").selectOption({ label: BRAND });
    await d.getByLabel("Media type").selectOption("TV");
    await d.getByLabel("Media spend").fill("3,500,000");
    await d.getByLabel("Media spots").fill("180");
    await d.getByRole("button", { name: "Save row" }).click();
    await page.waitForTimeout(2000);
    if (await d.getByRole("alert").count()) await page.keyboard.press("Escape");
    await expect(d).toBeHidden();

    const file = excel("competitor_media", "5-competitors-december-2026.xlsx", [
      [MONTH, BRAND, "Rival One", "TV", 4_200_000, 220, null],
      [MONTH, BRAND, "Rival One", "Press", 600_000, 9, null],
      [MONTH, BRAND, "Rival Two", "TV", 2_100_000, 110, null],
      [MONTH, BRAND, "Rival Three", "Radio", 350_000, 80, null],
    ]);
    await caption(page, "Step 9 · Competitors: upload rivals' TV, Press and Radio");
    await upload(page, "competitor_media", file);
    await expect(page.getByTestId("share-of-voice")).toContainText("%");

    await caption(page, "Step 9 · Competitors: log a rival's TikTok ad");
    await page.getByRole("button", { name: "Add ad" }).click();
    d = page.getByRole("dialog");
    await d.getByLabel("Ad rival").selectOption({ label: "Rival Two" });
    await d.getByLabel("Ad platform choice").selectOption("TikTok");
    await d.getByLabel("Ad link").fill("https://www.tiktok.com/");
    await d.getByLabel(/^Ad Hook/).fill(`Germ test on camera (${RUN})`);
    await d.getByLabel("Ad Call to action").fill("Shop now");
    await d.getByRole("button", { name: "Save ad" }).click();
    await expect(d).toBeHidden();

    await caption(page, "Step 9 · Competitors: monthly YouTube snapshot");
    await page.getByRole("button", { name: "Update snapshot" }).click();
    d = page.getByRole("dialog");
    await d.getByLabel(`${BRAND} subscribers`).fill("18,400");
    await d.getByLabel("Rival One subscribers").fill("96,000");
    await d.getByLabel("Rival Two subscribers").fill("41,500");
    await d.getByRole("button", { name: "Save snapshot" }).click();
    await expect(d).toBeHidden();

    await caption(page, "Step 9 · Competitors: name the owner of the TikTok log");
    const owner = page.getByTestId("source-tiktok_ads").getByLabel("TikTok ad log owner");
    await owner.fill("Media team");
    const save = page.getByTestId("source-tiktok_ads").getByRole("button", { name: "Save" });
    if (await save.count()) await save.click();
    ok("Share of voice, ad log, YouTube snapshot and source owner saved");
  });

  await test.step("10. Billing", async () => {
    const file = excel("bills", "6-bills-december-2026.xlsx", [
      ["LD-ASI-0901", "PO-9001", "Asiatic", BRAND, MONTH, addDays(TODAY, -42), 2_150_000, 280_435, "Unpaid", null, "TV, ATN News"],
      ["LD-MS-0902", "PO-9002", "Mindshare", BRAND, MONTH, addDays(TODAY, -19), 650_000, 84_783, "Finance/Audit", null, null],
      ["LD-ASI-0903", "PO-9003", "Asiatic", BRAND, MONTH, addDays(TODAY, -4), 300_000, 39_130, "Cheque in hand", null, null],
    ]);
    await go(page, "/billing", "Step 10 · Billing: upload the bills Excel file");
    await upload(page, "bills", file);
    await page.getByLabel("Search bills").fill("LD-");
    await page.getByRole("form", { name: "Bill filters" }).getByRole("button", { name: "Apply" }).click();
    await page.waitForLoadState("networkidle");
    const old = page.getByTestId("bill-LD-ASI-0901");
    await expect(old).toContainText("days");

    await caption(page, "Step 10 · Billing: remind the 42-day-old bill");
    await old.getByRole("button", { name: "More actions for LD-ASI-0901" }).click();
    const remind = page.getByRole("menuitem", { name: "Remind" });
    if (await remind.count()) await remind.click();
    else await page.keyboard.press("Escape");

    await caption(page, "Step 10 · Billing: add a note");
    await old.getByRole("button", { name: "More actions for LD-ASI-0901" }).click();
    await page.getByRole("menuitem", { name: "Note" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Bill note").fill("Chased with Asiatic finance");
    await d.getByRole("button", { name: "Save note" }).click();
    await expect(d).toBeHidden();

    await caption(page, "Step 10 · Billing: mark the cheque-in-hand bill as paid");
    const paid = page.getByTestId("bill-LD-ASI-0903");
    const markPaid = paid.getByRole("button", { name: "Mark paid" });
    if (await markPaid.count()) await markPaid.click();
    await expect(paid).toContainText("Payment Done");

    await caption(page, "Step 10 · Billing: export the bills to Excel");
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 30_000 }), page.getByRole("link", { name: "Export to Excel" }).click()]);
    await download.saveAs(path.join(FILES, "exports", download.suggestedFilename()));
    ok("Bills uploaded, reminded, noted, paid and exported");
  });

  await test.step("11. Home", async () => {
    await go(page, `/?month=${MONTH}`, "Step 11 · Home: alerts, key numbers, budget, bills and best channel");
    await expect(page.getByTestId("alerts")).toBeVisible();
    await expect(page.getByTestId(`home-budget-${BRAND}`)).toBeVisible();
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(1500);
    await caption(page, "Step 11 · Home: Quick actions opens a new bill form straight away");
    await page.getByRole("button", { name: "Quick actions" }).first().click();
    await page.getByRole("menuitem", { name: "New bill" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.waitForTimeout(1200);
    await page.keyboard.press("Escape");
    ok("Home and Quick actions work");
  });

  await test.step("12. Uploads & History", async () => {
    await go(page, "/uploads", "Step 12 · Uploads & History: every file is a version, every change is logged");
    await expect(page.getByTestId("uploads-table")).toContainText("december-2026");
    await expect(page.getByTestId("history-table")).toBeVisible();
    ok("All demo uploads are listed as versions");
  });

  await caption(page, "Demo complete · every module worked");
  await page.waitForTimeout(3000);
  expect(errors, `Browser errors: ${errors.join(" | ")}`).toEqual([]);
});
