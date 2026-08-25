import { expect, type Page, type TestInfo } from "@playwright/test";
import type { NlpStep } from "./nlp";
import { extractPlaywrightCode, promptCloud } from "./cursor-cloud";

export type RunContext = {
  subject: string;
  description: string;
};

const HEAL_ATTEMPTS = Math.max(0, Number(process.env.CURSOR_HEAL_ATTEMPTS ?? 1));

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
  ...args: string[]
) => (...args: unknown[]) => Promise<unknown>;

function nlpScript(steps: NlpStep[]): string {
  return steps.map((step) => `${step.index}. ${step.raw}`).join("\n");
}

async function compactDigest(page: Page): Promise<string> {
  const url = page.url();
  const title = await page.title();
  const controls = await page.evaluate(() => {
    const pick = (els: Element[]) =>
      els
        .map((el) => {
          const input = el as HTMLInputElement;
          return (el.id || input.name || (el.textContent || "").replace(/\s+/g, " ").trim()).slice(0, 40);
        })
        .filter(Boolean)
        .slice(0, 12);
    return {
      inputs: pick([...document.querySelectorAll("input, textarea, mat-select")]),
      buttons: pick([...document.querySelectorAll("button, [role='button']")]),
    };
  });
  return `url=${url}\ntitle=${title}\ninputs=${controls.inputs.join(",")}\nbuttons=${controls.buttons.join(",")}`;
}

function generatePrompt(nlp: string, ctx: RunContext): string {
  return [
    "Write one Playwright script for every NLP step. Use page, expect, ctx.",
    `ctx.subject and ctx.description are set. Subject hint: ${ctx.subject}`,
    "Prefer getByRole, getByLabel, getByText. No imports, no comments, no new page.",
    "Return one javascript fence only.",
    "",
    nlp,
  ].join("\n");
}

function healPrompt(nlp: string, digest: string, failedCode: string, failure: string): string {
  return [
    "Heal failed Playwright. Return a replacement javascript fence only.",
    "Use page, expect, ctx. Different locators than the failed code.",
    `FAIL: ${failure.slice(0, 180)}`,
    `PAGE: ${digest}`,
    `NLP:\n${nlp.slice(0, 900)}`,
    failedCode ? `FAILED:\n${failedCode.slice(-700)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function runPlaywright(page: Page, ctx: RunContext, code: string): Promise<void> {
  const fn = new AsyncFunction("page", "expect", "ctx", code);
  await fn(page, expect, ctx);
}

async function requestCode(prompt: string, testInfo: TestInfo | undefined, label: string): Promise<string> {
  const { answer, runId } = await promptCloud(prompt);
  testInfo?.annotations.push({ type: "cursor-cloud", description: `${label} ${runId || ""}` });
  const code = extractPlaywrightCode(answer);
  if (!code) {
    throw new Error(`Cursor Cloud returned no Playwright (${label}): ${answer.slice(0, 180)}`);
  }
  return code;
}

export async function runNlpWithCursorCloud(
  page: Page,
  steps: NlpStep[],
  ctx: RunContext,
  testInfo?: TestInfo,
): Promise<void> {
  const nlp = nlpScript(steps);
  let code = await requestCode(generatePrompt(nlp, ctx), testInfo, "generate");
  try {
    await runPlaywright(page, ctx, code);
    return;
  } catch (error) {
    if (HEAL_ATTEMPTS < 1) throw error;
    let lastError = error instanceof Error ? error.message : String(error);
    for (let attempt = 1; attempt <= HEAL_ATTEMPTS; attempt++) {
      console.warn(`Cursor Cloud heal ${attempt}/${HEAL_ATTEMPTS}: ${lastError.slice(0, 160)}`);
      const digest = await compactDigest(page);
      try {
        code = await requestCode(healPrompt(nlp, digest, code, lastError), testInfo, `heal-${attempt}`);
        await runPlaywright(page, ctx, code);
        console.log(`Cursor Cloud heal succeeded on attempt ${attempt}`);
        return;
      } catch (healError) {
        lastError = healError instanceof Error ? healError.message : String(healError);
        if (attempt === HEAL_ATTEMPTS) {
          throw new Error(`Cursor Cloud heal failed after ${HEAL_ATTEMPTS} attempt(s): ${lastError}`);
        }
      }
    }
  }
}
