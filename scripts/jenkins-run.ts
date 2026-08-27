import { chromium } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import { loadNlpCase, nlpPath } from "../tests/helpers/nlp";
import { runNlpCase } from "../tests/helpers/run-nlp";

loadEnv();

function requireEnv(name: string): string {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is missing`);
  return value;
}

async function launchBrowser() {
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

async function main(): Promise<void> {
  requireEnv("WOLKEN_USER");
  requireEnv("WOLKEN_PASSWORD");

  const filePath = process.env.NLP_FILE || nlpPath("create-broadcom-standard-case.nlp");
  const nlp = loadNlpCase(filePath);
  if (!nlp.steps.length) throw new Error(`No NLP steps in ${filePath}`);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const ctx = {
    subject: process.env.NLP_SUBJECT || `vSAN OSA cluster health issue on 8.0U2c [${stamp}]`,
    description:
      process.env.NLP_DESCRIPTION ||
      "Customer reports a vSAN OSA cluster health issue on release 8.0U2c. Please investigate High-P2 impact.",
  };

  console.log(`[jenkins] NLP ${filePath} steps=${nlp.steps.length} local Playwright first, LLM only on failure`);

  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const page = await context.newPage();
  try {
    await runNlpCase(page, nlp, ctx);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`[jenkins] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
});
