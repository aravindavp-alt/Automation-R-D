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

async function visible(page: Page, selector: string): Promise<boolean> {
  return page.locator(selector).first().isVisible().catch(() => false);
}

async function clickByName(page: Page, name: string): Promise<void> {
  const re = new RegExp(escapeRe(name).replace(/\s+/g, "\\s+"), "i");
  const locators = [
    page.getByRole("button", { name: re }),
    page.getByRole("link", { name: re }),
    page.getByRole("menuitem", { name: re }),
    page.getByRole("tab", { name: re }),
    page.getByRole("option", { name: re }),
    page.getByText(re, { exact: false }),
  ];
  for (const locator of locators) {
    const first = locator.first();
    if (await first.isVisible().catch(() => false)) {
      await first.click();
      return;
    }
  }
  throw new Error(`Local Playwright could not click "${name}"`);
}

async function loginIfNeeded(page: Page, user: string, password: string): Promise<void> {
  const passwordBox = page.locator('input[type="password"]').first();
  if (!(await passwordBox.isVisible().catch(() => false))) {
    await page.reload({ waitUntil: "domcontentloaded" });
    return;
  }
  const userBox = page.locator('input[type="email"], input[formcontrolname="username"], input[type="text"], input').first();
  await userBox.fill(user);
  await passwordBox.fill(password);
  const submit = page.getByRole("button", { name: /sign in|log in|login/i }).first();
  if (await submit.isVisible().catch(() => false)) {
    await submit.click();
  } else {
    await passwordBox.press("Enter");
  }
  await page.locator('input[type="password"]').first().waitFor({ state: "hidden", timeout: 30_000 }).catch(() => undefined);
}

async function pickOption(page: Page, value: string): Promise<boolean> {
  const short = value.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const re = new RegExp(escapeRe(short).replace(/\s+/g, "\\s+"), "i");
  const option = page.getByRole("option", { name: re }).first();
  if (await option.isVisible().catch(() => false)) {
    await option.click();
    return true;
  }
  const text = page.getByText(re).last();
  if (await text.isVisible().catch(() => false)) {
    await text.click();
    return true;
  }
  return false;
}

async function setLabeledField(page: Page, label: string, value: string): Promise<void> {
  const labelRe = new RegExp(escapeRe(label).replace(/\s+/g, "\\s+"), "i");
  const field = page.locator("mat-form-field, .mat-mdc-form-field, .mat-form-field").filter({ hasText: labelRe }).first();
  if (await field.count()) {
    await field.click();
    const input = field.locator("input, textarea, [contenteditable='true']").first();
    if (await input.count()) {
      await input.fill("");
      await input.type(value, { delay: 20 });
    } else {
      await page.keyboard.type(value, { delay: 20 });
    }
    if (await pickOption(page, value)) return;
    await page.keyboard.press("Enter").catch(() => undefined);
    await page.keyboard.press("Tab").catch(() => undefined);
    return;
  }

  const byLabel = page.getByLabel(labelRe).first();
  if (await byLabel.count()) {
    await byLabel.click();
    await byLabel.fill(value);
    if (await pickOption(page, value)) return;
    await page.keyboard.press("Enter").catch(() => undefined);
    return;
  }

  throw new Error(`Local Playwright could not set "${label}"`);
}

async function fillSubjectAndDescription(page: Page, ctx: RunContext): Promise<void> {
  const subject = page.getByLabel(/subject/i).first();
  if (await subject.count()) {
    await subject.fill(ctx.subject);
  } else {
    await setLabeledField(page, "Subject", ctx.subject);
  }

  const description = page.getByLabel(/description/i).first();
  if (await description.count()) {
    await description.click();
    await description.fill(ctx.description);
  } else {
    await setLabeledField(page, "Description", ctx.description);
  }
}

async function pasteScreenshot(page: Page): Promise<void> {
  const png = await page.screenshot({ type: "png" });
  await page.evaluate(async (b64) => {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: "image/png" });
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  }, png.toString("base64")).catch(() => undefined);

  const description = page.getByLabel(/description/i).first();
  if (await description.count()) await description.click();
  const paste = process.platform === "darwin" ? "Meta+v" : "Control+v";
  await page.keyboard.press(paste).catch(() => undefined);
}

async function submitCase(page: Page): Promise<void> {
  const submit = page.getByRole("button", { name: /submit/i }).first();
  if (await submit.isVisible().catch(() => false)) {
    await submit.click();
    return;
  }
  if (await visible(page, "#createSubmitBtn")) {
    await page.locator("#createSubmitBtn").click();
    return;
  }
  throw new Error("Local Playwright could not find Submit");
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
      continue;
    }

    if (/^login with username/i.test(text)) {
      await loginIfNeeded(page, user, password);
      continue;
    }

    if (/^click /i.test(text)) {
      await clickByName(page, text.replace(/^click /i, "").trim());
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
