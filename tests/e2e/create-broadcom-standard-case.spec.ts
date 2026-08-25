import { expect, test } from "@playwright/test";
import { loadNlp, nlpPath } from "../helpers/nlp";
import { executeStep } from "../helpers/wolken";

test.describe.configure({ mode: "serial" });

test("NLP file parses into browser steps", () => {
  const steps = loadNlp(nlpPath("create-broadcom-standard-case.nlp"), {
    ...process.env,
    WOLKEN_USER: process.env.WOLKEN_USER || "ci-user@example.com",
    WOLKEN_PASSWORD: process.env.WOLKEN_PASSWORD || "placeholder",
  });
  expect(steps.map((step) => step.kind)).toEqual([
    "navigate",
    "loginOrRefresh",
    "clickCreateCase",
    "clickCaseType",
    "clickBroadcomStandard",
    "choose",
    "enterSubjectDescription",
    "pasteScreenshot",
    "submit",
  ]);
  const choose = steps.find((step) => step.kind === "choose");
  if (choose?.kind !== "choose") throw new Error("missing choose step");
  expect(choose.fields).toMatchObject({
    siteId: "222284",
    contactName: "christian.lehmann@controlware.de",
    product: "VMware vSAN (VMware vSAN)",
    release: "8.0U2c",
    severity: "High - P2",
    component: "vSAN (OSA) (vSAN OSA)",
    responsibleOrg: "Support",
  });
});

test("NLP: create Broadcom Standard case in a real browser", async ({ page }) => {
  const steps = loadNlp(nlpPath("create-broadcom-standard-case.nlp"));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const ctx = {
    subject: `vSAN OSA cluster health issue on 8.0U2c [${stamp}]`,
    description:
      "Customer reports a vSAN OSA cluster health issue on release 8.0U2c. Please investigate High-P2 impact. Screenshot of the case form is pasted below.",
  };

  for (const step of steps) {
    await test.step(step.raw.split("\n")[0], async () => {
      await executeStep(page, step, ctx);
    });
  }
});
