import { readFileSync } from "node:fs";
import path from "node:path";

export type ChooseFields = {
  siteId?: string;
  contactName?: string;
  product?: string;
  release?: string;
  severity?: string;
  component?: string;
  responsibleOrg?: string;
};

export type NlpStep =
  | { kind: "navigate"; url: string; raw: string }
  | { kind: "loginOrRefresh"; username: string; password: string; raw: string }
  | { kind: "clickCreateCase"; raw: string }
  | { kind: "clickCaseType"; raw: string }
  | { kind: "clickBroadcomStandard"; raw: string }
  | { kind: "choose"; fields: ChooseFields; raw: string }
  | { kind: "enterSubjectDescription"; raw: string }
  | { kind: "pasteScreenshot"; raw: string }
  | { kind: "submit"; raw: string };

const FIELD_ALIASES: Record<string, keyof ChooseFields> = {
  siteid: "siteId",
  "site id": "siteId",
  "contact name": "contactName",
  contact: "contactName",
  product: "product",
  release: "release",
  "prod release": "release",
  sevierity: "severity",
  severity: "severity",
  component: "component",
  "responsible org": "responsibleOrg",
  "responsibleorg": "responsibleOrg",
};

function interpolate(text: string, env: NodeJS.ProcessEnv): string {
  return text.replace(/\$\{([A-Z0-9_]+)\}/g, (_, key: string) => env[key] ?? "");
}

function parseChooseBlock(lines: string[]): ChooseFields {
  const fields: ChooseFields = {};
  for (const line of lines) {
    const match = line.match(/^([^:]+):\s*(.+)$/);
    if (!match) continue;
    const key = match[1].trim().toLowerCase();
    const mapped = FIELD_ALIASES[key];
    if (mapped) fields[mapped] = match[2].trim();
  }
  return fields;
}

export function loadNlp(filePath: string, env: NodeJS.ProcessEnv = process.env): NlpStep[] {
  const rawFile = interpolate(readFileSync(filePath, "utf8"), env);
  const body = rawFile.split(/^\s*Steps:\s*$/im)[1] || rawFile;
  const withoutExpected = body.split(/^\s*Expected Result:/im)[0];
  const chunks = withoutExpected
    .split(/^\s*\d+\.\s+/m)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const steps: NlpStep[] = [];
  for (const raw of chunks) {
    const firstLine = raw.split("\n")[0].trim();

    if (/^navigate to /i.test(firstLine)) {
      steps.push({ kind: "navigate", url: firstLine.replace(/^navigate to /i, "").trim(), raw });
      continue;
    }
    const login = firstLine.match(
      /^login with username as ["“](.+?)["”] and password as ["“](.+?)["”] if screen is in login screen, else refresh/i
    );
    if (login) {
      steps.push({ kind: "loginOrRefresh", username: login[1], password: login[2], raw });
      continue;
    }
    if (/^click create case/i.test(firstLine)) {
      steps.push({ kind: "clickCreateCase", raw });
      continue;
    }
    if (/^click case type/i.test(firstLine)) {
      steps.push({ kind: "clickCaseType", raw });
      continue;
    }
    if (/^click broadcom standard/i.test(firstLine)) {
      steps.push({ kind: "clickBroadcomStandard", raw });
      continue;
    }
    if (/^choose:/i.test(firstLine)) {
      const extra = raw.split("\n").slice(1).map((line) => line.trim()).filter(Boolean);
      steps.push({ kind: "choose", fields: parseChooseBlock(extra), raw });
      continue;
    }
    if (/^enter subject and description/i.test(firstLine)) {
      steps.push({ kind: "enterSubjectDescription", raw });
      continue;
    }
    if (/^take screenshot and paste in description/i.test(firstLine)) {
      steps.push({ kind: "pasteScreenshot", raw });
      continue;
    }
    if (/^submit$/i.test(firstLine)) {
      steps.push({ kind: "submit", raw });
      continue;
    }
    throw new Error(`Unsupported NLP step: ${firstLine}`);
  }
  return steps;
}

export function nlpPath(name: string): string {
  return path.join(process.cwd(), "tests", "nlp", name);
}
