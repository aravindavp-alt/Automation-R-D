import { expect, type Page } from "@playwright/test";
import type { NlpCase } from "./nlp";

function productHint(nlp: NlpCase): string {
  const labeled = nlp.fields.Product || nlp.fields.product || "";
  const fact = labeled || nlp.facts.find((item) => /vsan|vmware|product/i.test(item)) || "";
  return fact.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function looksLikeCreateCase(nlp: NlpCase): boolean {
  return /create.*case|case is created|summary page/i.test(`${nlp.title}\n${nlp.expected}\n${nlp.steps.map((step) => step.text).join("\n")}`);
}

export async function judgeLocally(
  page: Page,
  nlp: NlpCase,
  ctx: { subject: string },
): Promise<void> {
  const body = page.locator("body");
  if (looksLikeCreateCase(nlp)) {
    await expect(body).toContainText(/\d{8}|summary/i, { timeout: 30_000 });
    if (ctx.subject) await expect(body).toContainText(ctx.subject, { timeout: 15_000 });
  } else if (nlp.expected) {
    const token = nlp.expected.split(/[.\n]/)[0]?.trim().slice(0, 48);
    if (token) await expect(body).toContainText(token, { timeout: 20_000 });
  } else {
    await expect(body).toBeVisible();
  }

  const severity = nlp.fields.Severity || nlp.fields.Sevierity || nlp.facts.find((fact) => /p[1-4]/i.test(fact));
  const siteId = nlp.fields.SiteID || nlp.fields.SiteId || nlp.facts.find((fact) => /^\d{5,}$/.test(fact));
  const product = productHint(nlp);

  if (severity) await expect(body).toContainText(severity, { timeout: 10_000 });
  if (siteId) await expect(body).toContainText(siteId, { timeout: 10_000 });
  if (product) await expect(body).toContainText(product, { timeout: 10_000 });
}
