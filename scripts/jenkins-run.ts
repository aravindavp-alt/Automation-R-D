import { chromium, type Browser } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { loadNlpCase, resolveNlpFiles, runContextFor } from "../tests/helpers/nlp";
import { runNlpCase } from "../tests/helpers/run-nlp";

loadEnv();

function requireEnv(name: string): string {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is missing`);
  return value;
}

async function launchBrowser(): Promise<Browser> {
  const headed = process.env.HEADED !== "false";
  const common = {
    headless: !headed,
    args: ["--window-size=1400,900"],
  };
  try {
    return await chromium.launch({ ...common, channel: process.env.PLAYWRIGHT_CHANNEL || "chrome" });
  } catch {
    return await chromium.launch(common);
  }
}

async function closeBrowser(browser: Browser): Promise<void> {
  try {
    await Promise.race([
      browser.close(),
      new Promise((resolve) => setTimeout(resolve, 5_000).unref()),
    ]);
  } catch {
    /* ignore */
  }
}

async function main(): Promise<void> {
  requireEnv("WOLKEN_USER");
  requireEnv("WOLKEN_PASSWORD");

  const files = resolveNlpFiles();
  const heal = String(process.env.CURSOR_HEAL_WITH || "mcp").trim().toLowerCase();
  const headed = process.env.HEADED !== "false";
  console.log(
    `[jenkins] scenarios=${files.length} heal=${heal} headed=${headed} (local Playwright first, LLM only on failure)`,
  );
  for (const file of files) {
    console.log(`[jenkins] queued ${path.relative(process.env.NLP_ROOT || process.cwd(), file)}`);
  }

  const browser = await launchBrowser();
  const failed: string[] = [];
  try {
    for (const filePath of files) {
      const nlp = loadNlpCase(filePath);
      if (!nlp.steps.length) throw new Error(`No NLP steps in ${filePath}`);
      const env = files.length === 1 ? process.env : { ...process.env, NLP_SUBJECT: "", NLP_DESCRIPTION: "" };
      const ctx = runContextFor(nlp, env);
      const label = nlp.title || path.basename(filePath);
      console.log(`[jenkins] START ${label} steps=${nlp.steps.length} file=${filePath}`);

      const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      const page = await context.newPage();
      try {
        await runNlpCase(page, nlp, ctx);
        console.log(`[jenkins] PASS ${label}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[jenkins] FAIL ${label}: ${message}`);
        failed.push(`${label}: ${message}`);
      } finally {
        await context.close().catch(() => undefined);
      }
    }
  } finally {
    console.log("[jenkins] closing browser");
    await closeBrowser(browser);
  }

  if (failed.length) {
    console.error(`[jenkins] ${files.length - failed.length} passed, ${failed.length} failed`);
    for (const item of failed) console.error(`[jenkins]  - ${item}`);
    process.exit(2);
  }
  console.log(`[jenkins] PASS all ${files.length} scenario(s)`);
  process.exit(0);
}

main().catch((error) => {
  console.error(`[jenkins] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
});
