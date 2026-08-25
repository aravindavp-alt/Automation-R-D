import { Agent, Cursor, CursorAgentError } from "@cursor/sdk";

export type CloudReply = {
  answer: string;
  runId: string | null;
  model: string;
};

function requireApiKey(): string {
  const apiKey = String(process.env.CURSOR_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("CURSOR_API_KEY is missing. Add it to .env or GitHub Actions secrets.");
  }
  return apiKey;
}

function cloudRepos(): { url: string; startingRef?: string }[] {
  const url = String(process.env.CURSOR_CLOUD_REPO || "https://github.com/aravindavp-alt/Automation-R-D.git").trim();
  const startingRef = String(process.env.CURSOR_CLOUD_REF || "main").trim();
  return url ? [{ url, startingRef }] : [];
}

function normalizeModelKey(value: string): string {
  return value.trim().toLowerCase().replace(/^cursor\s+/, "").replace(/[\s_]+/g, "-");
}

let modelCatalog: { id: string; displayName?: string; aliases?: string[] }[] | null = null;

async function resolveModel(requested: string, apiKey: string): Promise<string> {
  const raw = requested.trim() || "composer-2.5";
  if (!modelCatalog) {
    modelCatalog = await Cursor.models.list({ apiKey });
  }
  const wanted = normalizeModelKey(raw);
  const match = modelCatalog.find((item) => {
    const keys = [item.id, item.displayName, ...(item.aliases || [])].map((value) =>
      normalizeModelKey(String(value || "")),
    );
    return keys.includes(wanted);
  });
  if (match) return match.id;
  return raw;
}

export async function createCloudAgent() {
  const apiKey = requireApiKey();
  const model = await resolveModel(process.env.CURSOR_CLOUD_MODEL || "composer-2.5", apiKey);
  return Agent.create({
    apiKey,
    model: { id: model },
    cloud: {
      repos: cloudRepos(),
      skipReviewerRequest: true,
    },
  });
}

export async function askCloud(
  agent: Awaited<ReturnType<typeof createCloudAgent>>,
  prompt: string,
): Promise<CloudReply> {
  try {
    const run = await agent.send(prompt);
    const result = await run.wait();
    if (result.status === "error") {
      throw new Error(result.error?.message || "Cursor Cloud run failed");
    }
    if (result.status === "cancelled") {
      throw new Error("Cursor Cloud run was cancelled");
    }
    return {
      answer: String(result.result || "").trim(),
      runId: result.id || run.id || null,
      model: result.model?.id || "",
    };
  } catch (error) {
    if (error instanceof CursorAgentError) {
      throw new Error(`Cursor Cloud did not start: ${error.message}`);
    }
    throw error;
  }
}

export function extractPlaywrightCode(answer: string): string {
  if (!answer) return "";
  const fenced = answer.match(/```(?:javascript|js|ts)?\s*([\s\S]*?)```/i);
  const raw = (fenced ? fenced[1] : answer)
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed && !/^```/.test(trimmed);
    })
    .join("\n")
    .trim();
  if (!/await\s+page|page\.(goto|locator|getBy|waitFor)/.test(raw)) {
    return "";
  }
  return raw;
}

export function parseCheckDecision(answer: string): { pass: boolean; reason: string } {
  const raw = String(answer || "").trim();
  const first = raw.split("\n")[0].trim();
  if (/^\s*pass(?:ed)?\b/i.test(first) || /\bdecision\s*[:=]\s*pass/i.test(raw)) {
    return { pass: true, reason: raw.slice(0, 400) };
  }
  if (/^\s*fail(?:ed)?\b/i.test(first) || /\bdecision\s*[:=]\s*fail/i.test(raw)) {
    return { pass: false, reason: raw.slice(0, 400) };
  }
  try {
    const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || raw);
    const verdict = String(json?.decision || json?.result || json?.status || "").trim();
    if (/^(pass|passed|success|true)$/i.test(verdict)) {
      return { pass: true, reason: json?.reason || raw.slice(0, 400) };
    }
    if (/^(fail|failed|failure|false)$/i.test(verdict)) {
      return { pass: false, reason: json?.reason || raw.slice(0, 400) };
    }
  } catch {
    /* use first-line fallback */
  }
  throw new Error(`Cursor Cloud did not return PASS/FAIL: ${raw.slice(0, 240)}`);
}
