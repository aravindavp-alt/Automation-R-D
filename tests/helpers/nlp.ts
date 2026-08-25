import { readFileSync } from "node:fs";
import path from "node:path";

export type NlpStep = {
  index: number;
  raw: string;
  text: string;
};

function interpolate(text: string, env: NodeJS.ProcessEnv): string {
  return text.replace(/\$\{([A-Z0-9_]+)\}/g, (_, key: string) => env[key] ?? "");
}

export function loadNlp(filePath: string, env: NodeJS.ProcessEnv = process.env): NlpStep[] {
  const rawFile = interpolate(readFileSync(filePath, "utf8"), env);
  const body = rawFile.split(/^\s*Steps:\s*$/im)[1] || rawFile;
  const withoutExpected = body.split(/^\s*Expected Result:/im)[0];
  return withoutExpected
    .split(/^\s*\d+\.\s+/m)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((raw, index) => ({
      index: index + 1,
      raw,
      text: raw.replace(/\s+/g, " ").trim(),
    }));
}

export function isCheckNlp(text: string): boolean {
  return /^(wait|check|verify|assert|validate)\b/i.test(text.trim())
    || /\bcheck whether\b/i.test(text)
    || /\ball form details\b/i.test(text);
}

export function nlpPath(name: string): string {
  return path.join(process.cwd(), "tests", "nlp", name);
}
