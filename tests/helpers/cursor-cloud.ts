import { Agent, CursorAgentError } from "@cursor/sdk";

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

export async function promptCloud(prompt: string): Promise<CloudReply> {
  const apiKey = requireApiKey();
  const model = String(process.env.CURSOR_CLOUD_MODEL || "composer-2.5").trim() || "composer-2.5";
  try {
    const result = await Agent.prompt(prompt, {
      apiKey,
      model: { id: model },
      cloud: {
        repos: cloudRepos(),
        skipReviewerRequest: true,
      },
    });
    if (result.status === "error") {
      throw new Error(result.error?.message || "Cursor Cloud run failed");
    }
    if (result.status === "cancelled") {
      throw new Error("Cursor Cloud run was cancelled");
    }
    return {
      answer: String(result.result || "").trim(),
      runId: result.id || null,
      model: result.model?.id || model,
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
