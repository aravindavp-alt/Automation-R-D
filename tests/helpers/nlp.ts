import { readFileSync } from "node:fs";
import path from "node:path";

export type NlpStep = {
  index: number;
  raw: string;
  text: string;
};

export type NlpCase = {
  steps: NlpStep[];
  expected: string;
  startUrl: string;
  facts: string[];
};

function interpolate(text: string, env: NodeJS.ProcessEnv): string {
  return text.replace(/\$\{([A-Z0-9_]+)\}/g, (_, key: string) => env[key] ?? "");
}

export function loadNlpCase(filePath: string, env: NodeJS.ProcessEnv = process.env): NlpCase {
  const rawFile = interpolate(readFileSync(filePath, "utf8"), env);
  const expectedMatch = rawFile.split(/^\s*Expected Result:\s*/im);
  const expected = (expectedMatch[1] || "").trim();
  const body = (expectedMatch[0].split(/^\s*Steps:\s*$/im)[1] || expectedMatch[0]);
  const steps = body
    .split(/^\s*\d+\.\s+/m)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((raw, index) => ({
      index: index + 1,
      raw,
      text: raw.replace(/\s+/g, " ").trim(),
    }));

  const nav = steps.find((step) => /^navigate to /i.test(step.text));
  const startUrl = nav ? nav.text.replace(/^navigate to /i, "").trim() : "";

  const facts: string[] = [];
  for (const step of steps) {
    if (!/^choose:/i.test(step.raw)) continue;
    for (const line of step.raw.split("\n").slice(1)) {
      const match = line.match(/^[^:]+:\s*(.+)$/);
      if (match?.[1]) facts.push(match[1].trim());
    }
  }

  return { steps, expected, startUrl, facts };
}

/** @deprecated use loadNlpCase */
export function loadNlp(filePath: string, env: NodeJS.ProcessEnv = process.env): NlpStep[] {
  return loadNlpCase(filePath, env).steps;
}

export function nlpPath(name: string): string {
  return path.join(process.cwd(), "tests", "nlp", name);
}
