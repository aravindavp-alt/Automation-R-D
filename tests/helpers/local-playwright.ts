import type { Page } from "@playwright/test";
import type { NlpCase } from "./nlp";

type RunContext = {
  subject: string;
  description: string;
};

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fieldLines(raw: string): Array<{ label: string; value: string }> {
  return raw
    .split("\n")
    .slice(1)
    .map((line) => line.match(/^([^:]+):\s*(.+)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({ label: match[1].trim(), value: match[2].trim() }));
}

function createCaseButton(page: Page) {
  return page.getByRole("button", { name: /create\s*case/i }).or(page.locator("button.new-case"));
}

async function clickByName(page: Page, name: string): Promise<void> {
  const re = new RegExp(escapeRe(name).replace(/\s+/g, "\\s+"), "i");
  const target = page
    .getByRole("button", { name: re })
    .or(page.getByRole("link", { name: re }))
    .or(page.getByRole("menuitem", { name: re }))
    .or(page.getByRole("tab", { name: re }))
    .or(page.getByRole("option", { name: re }))
    .or(page.getByText(re, { exact: false }));
  await target.first().click({ timeout: 20_000 });
}

async function waitForDashboard(page: Page, timeout = 45_000): Promise<void> {
  await createCaseButton(page).first().waitFor({ state: "visible", timeout });
}

async function loginIfNeeded(page: Page, user: string, password: string): Promise<void> {
  const email = page.getByRole("textbox", { name: /email/i });
  const passwordBox = page.getByRole("textbox", { name: /password/i });
  const loginBtn = page.getByRole("button", { name: /^login$/i });

  await Promise.race([
    email.first().waitFor({ state: "visible", timeout: 20_000 }),
    createCaseButton(page).first().waitFor({ state: "visible", timeout: 20_000 }),
  ]).catch(() => undefined);

  if (await createCaseButton(page).first().isVisible().catch(() => false)) {
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForDashboard(page);
    return;
  }

  if (!(await email.first().isVisible().catch(() => false))) {
    throw new Error("Local Playwright: login form did not appear");
  }

  await email.first().fill(user);
  await passwordBox.first().fill(password);
  await loginBtn.first().click({ timeout: 10_000 });
  await waitForDashboard(page);
}

async function pickOption(page: Page, value: string): Promise<boolean> {
  const short = value.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const re = new RegExp(escapeRe(short).replace(/\s+/g, "\\s+"), "i");
  const option = page.getByRole("option", { name: re }).first();
  try {
    await option.click({ timeout: 4_000 });
    return true;
  } catch {
    const text = page.getByText(re).last();
    try {
      await text.click({ timeout: 2_000 });
      return true;
    } catch {
      return false;
    }
  }
}

async function setLabeledField(page: Page, label: string, value: string): Promise<void> {
  const labelRe = new RegExp(escapeRe(label).replace(/\s+/g, "\\s+"), "i");
  const byId = page.locator(`[id="${label}"], [id="${label} "]`).first();
  const field = page.locator("mat-form-field, .mat-mdc-form-field, .mat-form-field").filter({ hasText: labelRe }).first();
  const byLabel = page.getByLabel(labelRe).first();

  const control = (await byId.count()) ? byId : (await field.count()) ? field : byLabel;
  if (!(await control.count())) {
    throw new Error(`Local Playwright could not set "${label}"`);
  }

  await control.click({ timeout: 10_000 });
  const input = control.locator("input, textarea, [contenteditable='true']").first();
  if (await input.count()) {
    await input.fill("");
    await input.type(value, { delay: 20 });
  } else {
    await page.keyboard.type(value, { delay: 20 });
  }
  if (await pickOption(page, value)) return;
  await page.keyboard.press("Enter").catch(() => undefined);
  await page.keyboard.press("Tab").catch(() => undefined);
}

async function fillSubjectAndDescription(page: Page, ctx: RunContext): Promise<void> {
  const subject = page.locator('[id="Subject"], [id="Subject "]').or(page.getByLabel(/subject/i)).first();
  await subject.click({ timeout: 10_000 });
  await subject.fill(ctx.subject);

  const description = page.locator('[id="Description"], [id="Description "]').or(page.getByLabel(/description/i)).first();
  await description.click({ timeout: 10_000 });
  await description.fill(ctx.description);
}

async function pasteScreenshot(page: Page): Promise<void> {
  const png = await page.screenshot({ type: "png" });
  await page
    .evaluate(async (b64) => {
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: "image/png" });
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    }, png.toString("base64"))
    .catch(() => undefined);

  const description = page.locator('[id="Description"], [id="Description "]').or(page.getByLabel(/description/i)).first();
  if (await description.count()) await description.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+v" : "Control+v").catch(() => undefined);
}

async function submitCase(page: Page): Promise<void> {
  const submit = page.getByRole("button", { name: /submit/i }).or(page.locator("#createSubmitBtn")).first();
  await submit.click({ timeout: 15_000 });
}

export async function runNlpWithLocalPlaywright(page: Page, nlp: NlpCase, ctx: RunContext): Promise<void> {
  const user = String(process.env.WOLKEN_USER || "").trim();
  const password = String(process.env.WOLKEN_PASSWORD || "").trim();
  if (!user || !password) throw new Error("WOLKEN_USER / WOLKEN_PASSWORD missing");

  for (const step of nlp.steps) {
    const text = step.text;
    console.log(`[local] step ${step.index}: ${text.slice(0, 80)}`);

    if (/^navigate to /i.test(text)) {
      await page.goto(nlp.startUrl || text.replace(/^navigate to /i, "").trim(), { waitUntil: "domcontentloaded" });
      await Promise.race([
        page.getByRole("textbox", { name: /email/i }).first().waitFor({ state: "visible", timeout: 30_000 }),
        createCaseButton(page).first().waitFor({ state: "visible", timeout: 30_000 }),
      ]);
      continue;
    }

    if (/^login with username/i.test(text)) {
      await loginIfNeeded(page, user, password);
      continue;
    }

    if (/^click /i.test(text)) {
      const name = text.replace(/^click /i, "").trim();
      await clickByName(page, name);
      if (/create\s*case/i.test(name)) {
        await page.getByText(/case type|broadcom standard/i).first().waitFor({ timeout: 20_000 });
      }
      continue;
    }

    if (/^choose:/i.test(text)) {
      for (const field of fieldLines(step.raw)) {
        console.log(`[local] field ${field.label}`);
        await setLabeledField(page, field.label, field.value);
      }
      continue;
    }

    if (/subject and description/i.test(text)) {
      await fillSubjectAndDescription(page, ctx);
      continue;
    }

    if (/screenshot and paste/i.test(text)) {
      await pasteScreenshot(page);
      continue;
    }

    if (/summary page|upon submit|uppon submit/i.test(text)) {
      await submitCase(page);
      continue;
    }

    throw new Error(`Local Playwright has no handler for step ${step.index}: ${text}`);
  }
}
