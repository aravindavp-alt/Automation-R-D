import { Agent, CursorAgentError } from "@cursor/sdk";
import type { NlpCase } from "./nlp";

type CursorAgent = Awaited<ReturnType<typeof Agent.create>>;

export type AgentVerdict = {
  status: "PASS" | "FAIL";
  caseId?: string;
  subject?: string;
  notes?: string;
};

function requireEnv(name: string): string {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is missing`);
  return value;
}

function nlpScript(nlp: NlpCase): string {
  return nlp.steps.map((step) => `${step.index}. ${step.raw}`).join("\n");
}

function mcpServers() {
  const headed = process.env.HEADED !== "false";
  const playwrightArgs = ["-y", "@playwright/mcp@latest", "--browser", "chrome", "--caps=devtools"];
  if (!headed) playwrightArgs.push("--headless");
  return {
    playwright: {
      type: "stdio" as const,
      command: "npx",
      args: playwrightArgs,
    },
    "chrome-devtools": {
      type: "stdio" as const,
      command: "npx",
      args: ["-y", "chrome-devtools-mcp@latest", "--headless", "--isolated"],
    },
  };
}

function healPrompt(nlp: NlpCase, subject: string, description: string, failure: string): string {
  return [
    "The cheap local Playwright run failed. Finish this NLP case in the already-visible Chrome.",
    "Use Playwright MCP (snapshot, click, type). Use Chrome DevTools MCP only if a locator is unclear.",
    "Do not clone repos. Do not read workspace files. Do not copy helpers.",
    "Login with env WOLKEN_USER and WOLKEN_PASSWORD. Do not print the password.",
    `Local failure: ${failure.slice(0, 400)}`,
    `Subject to enter: ${subject}`,
    `Description to enter: ${description}`,
    "Complete every remaining NLP step including submit.",
    "End with one json fence only:",
    '{"status":"PASS"|"FAIL","caseId":"8-digit-or-empty","subject":"...","notes":"..."}',
    "",
    nlpScript(nlp),
    "",
    `Expected: ${nlp.expected}`,
  ].join("\n");
}

function parseVerdict(answer: string): AgentVerdict {
  const fenced = answer.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced ? fenced[1] : answer).trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`LLM returned no JSON verdict: ${answer.slice(0, 240)}`);
  }
  const parsed = JSON.parse(jsonMatch[0]) as AgentVerdict;
  if (parsed.status !== "PASS" && parsed.status !== "FAIL") {
    throw new Error(`Invalid verdict status: ${String(parsed.status)}`);
  }
  return parsed;
}

export function judgeAgentVerdict(nlp: NlpCase, subject: string, verdict: AgentVerdict): void {
  if (verdict.status !== "PASS") {
    throw new Error(`Agent FAIL: ${verdict.notes || "no notes"}`);
  }
  if (!verdict.caseId || !/^\d{8}$/.test(verdict.caseId)) {
    throw new Error(`Local judge: missing 8-digit case id (got ${verdict.caseId || "empty"})`);
  }
  if (!verdict.subject || !verdict.subject.includes(subject.slice(0, 24))) {
    throw new Error(`Local judge: subject mismatch (got ${verdict.subject || "empty"})`);
  }
  const severity = nlp.facts.find((fact) => /p[1-4]/i.test(fact));
  if (severity && verdict.notes && !new RegExp(severity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(`${verdict.subject} ${verdict.notes}`)) {
    console.warn(`[llm] severity ${severity} not echoed in verdict notes`);
  }
}

export async function healWithLocalMcp(
  nlp: NlpCase,
  ctx: { subject: string; description: string },
  failure: string,
): Promise<void> {
  const apiKey = requireEnv("CURSOR_API_KEY");
  requireEnv("WOLKEN_USER");
  requireEnv("WOLKEN_PASSWORD");
  const model = String(process.env.CURSOR_CLOUD_MODEL || "composer-2.5").trim() || "composer-2.5";

  console.log(`[llm] starting local Cursor + Playwright MCP model=${model}`);
  let agent: CursorAgent | undefined;
  try {
    agent = await Agent.create({
      apiKey,
      model: { id: model },
      mcpServers: mcpServers(),
      local: { cwd: process.cwd(), settingSources: [] as const },
    });
    console.log(`[llm] agent=${agent.agentId}`);
    const run = await agent.send(healPrompt(nlp, ctx.subject, ctx.description, failure));
    console.log(`[llm] run=${run.id}`);
    const result = await run.wait();
    if (result.status === "error") {
      throw new Error(result.error?.message || "LLM heal run failed");
    }
    if (result.status === "cancelled") {
      throw new Error("LLM heal run was cancelled");
    }
    const answer = String(result.result || "").trim();
    console.log(`[llm] agent output:\n${answer.slice(0, 2000)}`);
    judgeAgentVerdict(nlp, ctx.subject, parseVerdict(answer));
    console.log(`[llm] PASS after Playwright MCP heal`);
  } catch (error) {
    if (error instanceof CursorAgentError) {
      throw new Error(`LLM heal did not start: ${error.message}`);
    }
    throw error;
  } finally {
    await disposeAgent(agent);
  }
}

async function disposeAgent(agent: CursorAgent | undefined): Promise<void> {
  if (!agent) return;
  console.log("[llm] disposing Cursor agent and MCP browsers");
  try {
    agent.close();
  } catch {
    /* close is best-effort */
  }
  try {
    await Promise.race([
      agent[Symbol.asyncDispose](),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("agent dispose timed out after 8s")), 8_000).unref();
      }),
    ]);
  } catch (error) {
    console.warn(`[llm] ${error instanceof Error ? error.message : String(error)}`);
  }
}
