import { expect, type Page } from "@playwright/test";
import type { NlpCase } from "./nlp";

function productHint(facts: string[]): string {
  const product = facts.find((fact) => /vsan|vmware/i.test(fact));
  return product ? product.replace(/\s*\([^)]*\)\s*$/, "").trim() : "";
}

export async function judgeLocally(
  page: Page,
  nlp: NlpCase,
  ctx: { subject: string },
): Promise<void> {
  const body = page.locator("body");
  await expect(body).toContainText(/\d{8}|summary/i, { timeout: 30_000 });
  await expect(body).toContainText(ctx.subject, { timeout: 15_000 });

  const severity = nlp.facts.find((fact) => /p[1-4]/i.test(fact));
  const siteId = nlp.facts.find((fact) => /^\d{5,}$/.test(fact));
  const product = productHint(nlp.facts);

  if (severity) await expect(body).toContainText(severity, { timeout: 10_000 });
  if (siteId) await expect(body).toContainText(siteId, { timeout: 10_000 });
  if (product) await expect(body).toContainText(product, { timeout: 10_000 });
}
