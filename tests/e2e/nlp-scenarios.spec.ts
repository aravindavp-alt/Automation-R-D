import { test } from "@playwright/test";
import { loadNlpCase, resolveNlpFiles, runContextFor } from "../helpers/nlp";
import { runNlpCase } from "../helpers/run-nlp";
import path from "node:path";

test.describe.configure({ mode: "serial" });
test.setTimeout(20 * 60 * 1000);

const nlpFiles = resolveNlpFiles();

for (const filePath of nlpFiles) {
  const name = path.basename(filePath, ".nlp");

  test.describe(name, () => {
    test("NLP file splits into numbered steps", () => {
      const nlp = loadNlpCase(filePath, {
        ...process.env,
        WOLKEN_USER: process.env.WOLKEN_USER || "ci-user@example.com",
        WOLKEN_PASSWORD: process.env.WOLKEN_PASSWORD || "placeholder",
      });
      test.info().annotations.push({
        type: "nlp-file",
        description: filePath,
      });
      test.info().annotations.push({
        type: "nlp-steps",
        description: nlp.steps.map((step) => `${step.index}. ${step.raw.split("\n")[0]}`).join(" | "),
      });
      if (nlp.steps.length < 1) {
        throw new Error(`${name}: NLP file produced no steps`);
      }
      if (!nlp.startUrl) {
        throw new Error(`${name}: NLP file has no navigate-to URL for heal reset`);
      }
    });

    test("NLP: local Playwright runs the case; LLM heals on failure", async ({ page }, testInfo) => {
      const nlp = loadNlpCase(filePath);
      await runNlpCase(page, nlp, runContextFor(nlp), testInfo);
    });
  });
}
