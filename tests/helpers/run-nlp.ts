import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { isCheckNlp, type NlpStep } from "./nlp";
import {
  askCloud,
  createCloudAgent,
  extractPlaywrightCode,
  parseCheckDecision,
} from "./cursor-cloud";

export type RunContext = {
  subject: string;
  description: string;
};

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
  ...args: string[]
) => (...args: unknown[]) => Promise<unknown>;

async function pageDigest(page: Page): Promise<string> {
  const url = page.url();
  const title = await page.title();
  const text = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 1800);
  const fields = await page.evaluate(() =>
    [...document.querySelectorAll("input, textarea, select, mat-select, button, [role='option']")]
      .slice(0, 50)
      .map((el) => {
        const input = el as HTMLInputElement;
        return {
          tag: el.tagName.toLowerCase(),
          id: el.id,
          type: input.type || "",
          name: input.name || el.getAttribute("aria-label") || "",
          text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
          value: (input.value || "").slice(0, 80),
        };
      }),
  );
  return JSON.stringify({ url, title, text, fields }, null, 2);
}

function actionPrompt(step: NlpStep, digest: string, ctx: RunContext, failure?: string): string {
  return [
    "You are generating Playwright for a live browser test.",
    "Parse the NLP step against the current page snapshot and return executable Playwright JavaScript.",
    "Use the existing `page` object. You may also use `expect` and `ctx`.",
    `ctx.subject = ${JSON.stringify(ctx.subject)}`,
    `ctx.description = ${JSON.stringify(ctx.description)}`,
    "Do not invent a new page. Do not wrap in a function. Do not import modules.",
    "Return only a javascript code fence with await page ... commands.",
    failure ? `Previous attempt failed:\n${failure}` : "",
    "",
    `NLP step ${step.index}:`,
    step.raw,
    "",
    "PAGE SNAPSHOT:",
    digest,
  ]
    .filter(Boolean)
    .join("\n");
}

function checkPrompt(step: NlpStep, digest: string, ctx: RunContext): string {
  return [
    "This NLP step is a check/validate. Do not return Playwright actions.",
    "Reply with PASS or FAIL on the first line, then a short reason.",
    `Expected subject: ${ctx.subject}`,
    `Form description: ${ctx.description}`,
    "",
    `NLP step ${step.index}:`,
    step.raw,
    "",
    "PAGE SNAPSHOT:",
    digest,
  ].join("\n");
}

async function runPlaywright(page: Page, ctx: RunContext, code: string): Promise<void> {
  const fn = new AsyncFunction("page", "expect", "ctx", code);
  await fn(page, expect, ctx);
}

export async function runNlpWithCursorCloud(
  page: Page,
  steps: NlpStep[],
  ctx: RunContext,
  testInfo?: TestInfo,
): Promise<void> {
  const agent = await createCloudAgent();
  try {
    for (const step of steps) {
      await test.step(`NLP ${step.index}: ${step.raw.split("\n")[0]}`, async () => {
        const digest = await pageDigest(page);
        if (isCheckNlp(step.text)) {
          const { answer, runId } = await askCloud(agent, checkPrompt(step, digest, ctx));
          testInfo?.annotations.push({ type: "cursor-cloud", description: `check ${runId || ""}` });
          const decision = parseCheckDecision(answer);
          if (!decision.pass) {
            throw new Error(`NLP check failed: ${decision.reason}`);
          }
          return;
        }

        let lastError = "";
        for (let attempt = 1; attempt <= 3; attempt++) {
          const { answer, runId } = await askCloud(agent, actionPrompt(step, digest, ctx, lastError));
          testInfo?.annotations.push({
            type: "cursor-cloud",
            description: `step ${step.index} attempt ${attempt} ${runId || ""}`,
          });
          const code = extractPlaywrightCode(answer);
          if (!code) {
            lastError = `No executable Playwright in reply: ${answer.slice(0, 240)}`;
            if (attempt === 3) throw new Error(lastError);
            continue;
          }
          try {
            await runPlaywright(page, ctx, code);
            return;
          } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
            if (attempt === 3) throw error;
          }
        }
      });
    }
  } finally {
    agent.close();
  }
}
