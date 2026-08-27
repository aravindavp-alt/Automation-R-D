import { existsSync, globSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export type NlpStep = {
  index: number;
  raw: string;
  text: string;
};

export type NlpCase = {
  filePath: string;
  title: string;
  subject: string;
  description: string;
  steps: NlpStep[];
  expected: string;
  startUrl: string;
  facts: string[];
  fields: Record<string, string>;
};

export type RunContext = {
  subject: string;
  description: string;
};

function interpolate(text: string, env: NodeJS.ProcessEnv): string {
  return text.replace(/\$\{([A-Z0-9_]+)\}/g, (_, key: string) => env[key] ?? "");
}

function headerValue(raw: string, name: string): string {
  const match = raw.match(new RegExp(`^\\s*${name}:\\s*(.+)$`, "im"));
  return match?.[1]?.trim() || "";
}

function titleOf(raw: string): string {
  const block = raw.match(/^\s*Test Case Title:\s*\r?\n?([\s\S]*?)(?=^\s*Steps:|^\s*Expected Result:|^\s*Subject:|^\s*Description:)/im);
  if (block?.[1]) return block[1].replace(/\s+/g, " ").trim();
  return headerValue(raw, "Test Case Title");
}

export function nlpDir(root = process.cwd()): string {
  return path.join(root, "tests", "nlp");
}

export function nlpPath(name: string): string {
  return path.join(nlpDir(), name);
}

export function resolveNlpFiles(spec = process.env.NLP_FILE, root = process.env.NLP_ROOT || process.cwd()): string[] {
  const trimmed = String(spec || "tests/nlp/*.nlp").trim();
  const pattern = trimmed === "*" || /^all$/i.test(trimmed) ? "tests/nlp/**/*.nlp" : trimmed;
  const parts = pattern
    .split(/[,;\n]/)
    .map((part) => part.trim())
    .filter(Boolean);

  const files = new Set<string>();
  for (const part of parts) {
    const abs = path.isAbsolute(part) ? part : path.join(root, part);
    if (existsSync(abs) && statSync(abs).isFile()) {
      files.add(path.resolve(abs));
      continue;
    }
    const matches = globSync(part.replaceAll("\\", "/"), { cwd: root, absolute: true });
    for (const match of matches) {
      if (match.endsWith(".nlp") && existsSync(match) && statSync(match).isFile()) {
        files.add(path.resolve(match));
      }
    }
  }

  const sorted = [...files].sort((a, b) => a.localeCompare(b));
  if (!sorted.length) {
    throw new Error(`No NLP files matched "${pattern}" under ${root}`);
  }
  return sorted;
}

export function loadNlpCase(filePath: string, env: NodeJS.ProcessEnv = process.env): NlpCase {
  const rawFile = interpolate(readFileSync(filePath, "utf8"), env);
  const expectedMatch = rawFile.split(/^\s*Expected Result:\s*/im);
  const expected = (expectedMatch[1] || "").trim();
  const body = expectedMatch[0].split(/^\s*Steps:\s*$/im)[1] || expectedMatch[0];
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

  const fields: Record<string, string> = {};
  const facts: string[] = [];
  for (const step of steps) {
    if (!/^choose:/i.test(step.raw)) continue;
    for (const line of step.raw.split("\n").slice(1)) {
      const match = line.match(/^([^:]+):\s*(.+)$/);
      if (!match?.[1] || !match[1].trim()) continue;
      const label = match[1].trim();
      const value = match[2].trim();
      fields[label] = value;
      facts.push(value);
    }
  }

  const title = titleOf(rawFile) || path.basename(filePath, ".nlp");
  return {
    filePath: path.resolve(filePath),
    title,
    subject: headerValue(rawFile, "Subject"),
    description: headerValue(rawFile, "Description"),
    steps,
    expected,
    startUrl,
    facts,
    fields,
  };
}

export function runContextFor(nlp: NlpCase, env: NodeJS.ProcessEnv = process.env): RunContext {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return {
    subject: String(env.NLP_SUBJECT || "").trim() || nlp.subject || `${nlp.title} [${stamp}]`,
    description:
      String(env.NLP_DESCRIPTION || "").trim() ||
      nlp.description ||
      nlp.expected ||
      `Automated NLP scenario: ${nlp.title}`,
  };
}

/** @deprecated use loadNlpCase */
export function loadNlp(filePath: string, env: NodeJS.ProcessEnv = process.env): NlpStep[] {
  return loadNlpCase(filePath, env).steps;
}
