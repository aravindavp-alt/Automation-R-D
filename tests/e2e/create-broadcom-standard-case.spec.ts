import { test } from "@playwright/test";
import { loadNlpCase, nlpPath } from "../helpers/nlp";
import { runNlpWithCursorCloud } from "../helpers/run-nlp";

test.describe.configure({ mode: "serial" });
test.setTimeout(20 * 60 * 1000);

test("NLP file splits into numbered steps", () => {
  const nlp = loadNlpCase(nlpPath("create-broadcom-standard-case.nlp"), {
    ...process.env,
    WOLKEN_USER: process.env.WOLKEN_USER || "ci-user@example.com",
    WOLKEN_PASSWORD: process.env.WOLKEN_PASSWORD || "placeholder",
  });
  test.info().annotations.push({
    type: "nlp-steps",
    description: nlp.steps.map((step) => `${step.index}. ${step.raw.split("\n")[0]}`).join(" | "),
  });
  if (nlp.steps.length < 1) {
    throw new Error("NLP file produced no steps");
  }
  if (!nlp.startUrl) {
    throw new Error("NLP file has no navigate-to URL for heal reset");
  }
  if (!nlp.facts.some((fact) => /p[1-4]/i.test(fact))) {
    throw new Error("NLP file has no severity fact for local judge");
  }
});

test("NLP: Cursor Cloud parses and runs the case in a real browser", async ({ page }, testInfo) => {
  const nlp = loadNlpCase(nlpPath("create-broadcom-standard-case.nlp"));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await runNlpWithCursorCloud(
    page,
    nlp,
    {
      subject: `vSAN OSA cluster health issue on 8.0U2c [${stamp}]`,
      description:
        "Customer reports a vSAN OSA cluster health issue on release 8.0U2c. Please investigate High-P2 impact. Screenshot of the case form is pasted below.",
    },
    testInfo,
  );
});
