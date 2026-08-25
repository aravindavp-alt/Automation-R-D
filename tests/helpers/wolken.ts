import { expect, type Locator, type Page } from "@playwright/test";
import type { ChooseFields, NlpStep } from "./nlp";

export type RunContext = {
  subject: string;
  description: string;
};

async function visibleLoginForm(page: Page): Promise<boolean> {
  const email = page.locator("#mat-input-0, input[type='text']").first();
  const password = page.locator("#mat-input-1, input[type='password']").first();
  const loginBtn = page.getByRole("button", { name: /login/i });
  try {
    await email.waitFor({ state: "visible", timeout: 8_000 });
    return (await password.isVisible()) && (await loginBtn.isVisible());
  } catch {
    return false;
  }
}

async function pickOption(page: Page, text: string | RegExp, exact = false): Promise<void> {
  const matcher =
    typeof text === "string" && exact ? new RegExp(`^\\s*${escapeRegExp(text)}\\s*$`) : text;
  const option = page.locator("mat-option").filter({ hasText: matcher }).first();
  await option.waitFor({ state: "visible", timeout: 20_000 });
  await option.click();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function typeAndPick(
  page: Page,
  input: Locator,
  query: string,
  optionText: string | RegExp,
): Promise<void> {
  await input.click();
  await input.fill("");
  await input.pressSequentially(query, { delay: 35 });
  await page.waitForTimeout(1500);
  await pickOption(page, optionText);
}

async function fillOrgIfNeeded(page: Page, value: string): Promise<void> {
  const org = page.locator("#Responsible\\ ORG, [id='Responsible ORG']");
  await org.waitFor({ state: "visible", timeout: 20_000 });
  const current = (await org.inputValue()).trim();
  if (current.toLowerCase() === value.toLowerCase()) return;
  await typeAndPick(page, org, value, value);
}

function productSearchName(product: string): string {
  return product.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

async function chooseProduct(page: Page, product: string): Promise<void> {
  const query = productSearchName(product);
  const input = page.locator("[id='Product ']");
  await input.click();
  await input.fill("");
  await input.pressSequentially(query, { delay: 35 });
  const search = page.locator("[id='Product _search']");
  if (await search.isVisible()) {
    await search.click();
    const row = page.locator("tr.mat-row").filter({ hasText: new RegExp(`^\\s*${escapeRegExp(query)}\\s*$`) }).first();
    await row.waitFor({ state: "visible", timeout: 20_000 });
    await row.click();
    return;
  }
  await pickOption(page, query);
}

async function chooseFields(page: Page, fields: ChooseFields): Promise<void> {
  if (fields.responsibleOrg) {
    await fillOrgIfNeeded(page, fields.responsibleOrg);
  }
  if (fields.siteId) {
    await typeAndPick(
      page,
      page.locator("#SiteId"),
      fields.siteId,
      new RegExp(`\\(${escapeRegExp(fields.siteId)}\\)\\s*$`)
    );
  }
  if (fields.contactName) {
    const query = fields.contactName.split("@")[0];
    await typeAndPick(page, page.locator("[id='Contact Name']"), query, fields.contactName);
  }
  if (fields.product) {
    await chooseProduct(page, fields.product);
    await page.waitForTimeout(1500);
  }
  if (fields.release) {
    await typeAndPick(page, page.locator("[id='Prod Release']"), fields.release, fields.release);
  }
  if (fields.severity) {
    await page.locator("#Severity").click();
    await pickOption(page, fields.severity, true);
  }
  if (fields.component) {
    const component = page.locator("#Component");
    const current = (await component.inputValue().catch(() => "")).trim();
    if (!current.toLowerCase().includes(fields.component.split("(")[0].trim().toLowerCase())) {
      await page.locator("#Component").click();
      await pickOption(page, fields.component);
    }
  }
}

async function pasteScreenshot(page: Page, description: string): Promise<void> {
  const screenshot = await page.screenshot({ fullPage: true, type: "png" });
  const dataUrl = `data:image/png;base64,${screenshot.toString("base64")}`;
  await page.evaluate(
    ({ html, dataUrl: src }) => {
      const tinymce = (window as unknown as { tinymce?: { activeEditor?: Tiny; editors?: Tiny[] } }).tinymce;
      const editor = tinymce?.activeEditor || tinymce?.editors?.[0];
      if (!editor) {
        throw new Error("TinyMCE description editor was not found");
      }
      editor.setContent(`${html}<p><img src="${src}" alt="Case form screenshot" style="max-width:100%;" /></p>`);
      editor.fire("change");
      editor.save();
    },
    { html: `<p>${description}</p>`, dataUrl }
  );
}

type Tiny = {
  setContent: (html: string) => void;
  fire: (name: string) => void;
  save: () => void;
};

async function submitAndAssert(page: Page, subject: string): Promise<void> {
  await page.locator("#createSubmitBtn").click();
  const title = page.locator("body");
  await expect(title).toContainText(new RegExp(`${escapeRegExp(subject)}|\\d{8}`), { timeout: 90_000 });
  const pageTitle = await page.title();
  const listed = await page.getByText(subject).first().isVisible().catch(() => false);
  if (!listed && !/^\d{8}\b/.test(pageTitle)) {
    throw new Error(`Submit did not land on a created case. Title was: ${pageTitle}`);
  }
}

export async function executeStep(page: Page, step: NlpStep, ctx: RunContext): Promise<void> {
  switch (step.kind) {
    case "navigate":
      await page.goto(step.url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);
      return;
    case "loginOrRefresh":
      if (!step.username || !step.password) {
        throw new Error("WOLKEN_USER and WOLKEN_PASSWORD must be set");
      }
      if (await visibleLoginForm(page)) {
        await page.locator("#mat-input-0").fill(step.username);
        await page.locator("#mat-input-1").fill(step.password);
        await page.locator("button[type='submit']").click();
      } else {
        await page.reload({ waitUntil: "domcontentloaded" });
      }
      await page.getByRole("button", { name: /create case/i }).first().waitFor({ timeout: 60_000 });
      return;
    case "clickCreateCase":
      await page.locator("button.new-case").click();
      await page.waitForURL(/request_creation/, { timeout: 30_000 });
      return;
    case "clickCaseType":
      await page.locator("#mat-select-4, mat-select").first().click();
      return;
    case "clickBroadcomStandard":
      await pickOption(page, "Broadcom Standard", true);
      await page.locator("#SiteId").waitFor({ state: "visible", timeout: 30_000 });
      return;
    case "choose":
      await chooseFields(page, step.fields);
      return;
    case "enterSubjectDescription":
      await page.locator("input#Subject").fill(ctx.subject);
      return;
    case "pasteScreenshot":
      await pasteScreenshot(page, ctx.description);
      return;
    case "submit":
      await submitAndAssert(page, ctx.subject);
      return;
  }
}
