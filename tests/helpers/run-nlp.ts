import { expect, type Page, type TestInfo } from "@playwright/test";
import type { NlpCase } from "./nlp";
import { extractPlaywrightCode, promptCloud } from "./cursor-cloud";
import { judgeLocally } from "./judge";

export type RunContext = {
  subject: string;
  description: string;
};

const HEAL_ATTEMPTS = Math.max(0, Number(process.env.CURSOR_HEAL_ATTEMPTS ?? 1));

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
  ...args: string[]
) => (...args: unknown[]) => Promise<unknown>;

function nlpScript(nlp: NlpCase): string {
  return nlp.steps.map((step) => `${step.index}. ${step.raw}`).join("\n");
}

function requireGoto(code: string, label: string): string {
  if (!/page\.goto\s*\(/.test(code)) {
    throw new Error(`Cursor Cloud ${label} must include page.goto (complete script, not a mid-flow snippet)`);
  }
  return code;
}

async function compactDigest(page: Page): Promise<string> {
  const url = page.url();
  const title = await page.title().catch(() => "");
  const controls = await page
    .evaluate(() => {
      const pick = (els: Element[]) =>
        [...new Set(
          els
            .map((el) => {
              const input = el as HTMLInputElement;
              return (el.id || input.name || (el.textContent || "").replace(/\s+/g, " ").trim()).slice(0, 32);
            })
            .filter(Boolean),
        )].slice(0, 10);
      return {
        inputs: pick([...document.querySelectorAll("input, textarea, mat-select")]),
        buttons: pick([...document.querySelectorAll("button")]),
      };
    })
    .catch(() => ({ inputs: [] as string[], buttons: [] as string[] }));
  return `${url} | ${title} | in:${controls.inputs.join(",")} | btn:${controls.buttons.join(",")}`;
}

function generatePrompt(nlp: string, ctx: RunContext): string {
  return [
    "Empty workspace. Do not read files. Do not copy helpers or locators.",
    "Write Playwright only from the NLP steps. page, expect, ctx exist. One js fence.",
    "Complete script starting with await page.goto. No comments. No verdict.",
    `ctx.subject=${ctx.subject}`,
    "Use getByRole/getByLabel/getByText.",
    nlp,
  ].join("\n");
}

function healPrompt(nlp: string, digest: string, failedCode: string, failure: string, startUrl: string): string {
  return [
    "Empty workspace. Do not read files. Rewrite a COMPLETE Playwright script from NLP.",
    "First statement must be await page.goto. page, expect, ctx only. One js fence.",
    `Start URL: ${startUrl}`,
    "Browser was reset. Ignore leftover UI. Login then finish every NLP step.",
    `FAIL: ${failure.slice(0, 160)}`,
    `Was at: ${digest.slice(0, 220)}`,
    nlp.slice(0, 700),
    failedCode ? `Broken tail: ${failedCode.slice(-400)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function runPlaywright(page: Page, ctx: RunContext, code: string): Promise<void> {
  const fn = new AsyncFunction("page", "expect", "ctx", code);
  await fn(page, expect, ctx);
}

async function requestCode(prompt: string, testInfo: TestInfo | undefined, label: string): Promise<string> {
  const { answer, runId, model } = await promptCloud(prompt);
  console.log(`[nlp] Cursor Cloud no-repo ${label} model=${model} run=${runId || "none"}`);
  testInfo?.annotations.push({ type: "cursor-cloud", description: `no-repo ${label} ${model} ${runId || ""}` });
  const code = extractPlaywrightCode(answer);
  if (!code) {
    throw new Error(`Cursor Cloud returned no Playwright (${label}): ${answer.slice(0, 180)}`);
  }
  const script = requireGoto(code, label);
  await testInfo?.attach(`${label}.js`, { body: script, contentType: "text/javascript" });
  return script;
}

async function resetBrowser(page: Page, startUrl: string): Promise<void> {
  const context = page.context();
  await context.clearCookies();
  for (const extra of context.pages()) {
    if (extra !== page) await extra.close().catch(() => undefined);
  }
  await page.evaluate(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* ignore cross-origin */
    }
  }).catch(() => undefined);
  await page.goto("about:blank", { waitUntil: "domcontentloaded" });
  if (startUrl) {
    await page.goto(startUrl, { waitUntil: "domcontentloaded" });
  }
}

export async function runNlpWithCursorCloud(
  page: Page,
  nlp: NlpCase,
  ctx: RunContext,
  testInfo?: TestInfo,
): Promise<void> {
  const script = nlpScript(nlp);
  let code = await requestCode(generatePrompt(script, ctx), testInfo, "generate");
  try {
    await runPlaywright(page, ctx, code);
    await judgeLocally(page, nlp, ctx);
    return;
  } catch (error) {
    if (HEAL_ATTEMPTS < 1) throw error;
    let lastError = error instanceof Error ? error.message : String(error);
    const digest = await compactDigest(page);
    for (let attempt = 1; attempt <= HEAL_ATTEMPTS; attempt++) {
      console.warn(`Cursor Cloud heal ${attempt}/${HEAL_ATTEMPTS}: ${lastError.slice(0, 160)}`);
      await resetBrowser(page, nlp.startUrl);
      try {
        code = await requestCode(
          healPrompt(script, digest, code, lastError, nlp.startUrl),
          testInfo,
          `heal-${attempt}`,
        );
        await runPlaywright(page, ctx, code);
        await judgeLocally(page, nlp, ctx);
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
