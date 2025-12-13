import type { LLMProvider, LLMResponse, LLMWrite, ProviderContext, SkillSpec } from "./types.js";
import type { LintResult, TestResult } from "@skills-kit/core";

const API_URL = "https://api.anthropic.com/v1/messages";

function systemPromptBase() {
  return [
    "You generate repo files for the skills-kit project.",
    "CRITICAL: You MUST output ONLY raw JSON. No explanations. No markdown. No code blocks. No backticks. Just pure JSON starting with { or [.",
    "Never use absolute paths or .. segments. Paths are relative to the skill root.",
    "Only allowed locations: SKILL.md, policy.yaml, scripts/, tests/, resources/.",
    "The entrypoint MUST be scripts/run.cjs and that file MUST exist.",
    "Scripts must be deterministic: read JSON from stdin, write JSON to stdout, no randomness/time/network.",
    "If the request mentions Playwright (or browser automation), scripts/run.cjs must not crash if Playwright is missing: output ok:false with error.code=MISSING_DEP and a clear message.",
    "tests/golden.json must include a case that passes without Playwright installed (missing dep branch).",
    "policy.yaml must default to network:false and empty allowlists unless explicitly required by the request."
  ].join(" ");
}

type AnthropicCall = {
  model: string;
  system: string;
  user: string;
  max_tokens: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function defaultPolicy() {
  return {
    network: false,
    fs_read: [] as string[],
    fs_write: [] as string[],
    exec_allowlist: [] as string[],
    domains_allowlist: [] as string[]
  };
}

function normalizeSpec(raw: unknown): SkillSpec {
  if (!isRecord(raw)) throw new Error("Spec must be a JSON object");
  const nameVal = raw["name"];
  const descVal = raw["description"];
  if (!isNonEmptyString(nameVal)) throw new Error("Spec.name must be a non-empty string");
  if (!isNonEmptyString(descVal)) throw new Error("Spec.description must be a non-empty string");

  const policyRaw = raw["policy"];
  const p = defaultPolicy();
  if (isRecord(policyRaw)) {
    if (typeof policyRaw["network"] === "boolean") p.network = policyRaw["network"];
    if (isStringArray(policyRaw["fs_read"])) p.fs_read = policyRaw["fs_read"];
    if (isStringArray(policyRaw["fs_write"])) p.fs_write = policyRaw["fs_write"];
    if (isStringArray(policyRaw["exec_allowlist"])) p.exec_allowlist = policyRaw["exec_allowlist"];
    if (isStringArray(policyRaw["domains_allowlist"])) p.domains_allowlist = policyRaw["domains_allowlist"];
  }

  const spec: SkillSpec = {
    ...raw,
    name: nameVal.trim(),
    description: descVal.trim(),
    version: typeof raw["version"] === "string" ? raw["version"] : "0.1.0",
    authors: isStringArray(raw["authors"]) ? raw["authors"] : ["skills-kit"],
    allowed_tools: isStringArray(raw["allowed_tools"]) ? raw["allowed_tools"] : [],
    entrypoints: isStringArray(raw["entrypoints"]) ? raw["entrypoints"] : ["scripts/run.cjs"],
    inputs: raw["inputs"] ?? {},
    outputs: raw["outputs"] ?? {},
    capabilities: isStringArray(raw["capabilities"]) ? raw["capabilities"] : undefined,
    runtime_dependencies: isStringArray(raw["runtime_dependencies"])
      ? raw["runtime_dependencies"]
      : undefined,
    policy: p,
    tests: isRecord(raw["tests"]) ? (raw["tests"] as SkillSpec["tests"]) : undefined
  };

  if (!spec.entrypoints?.includes("scripts/run.cjs")) {
    spec.entrypoints = ["scripts/run.cjs"];
  }

  return spec;
}

function extractJsonText(responseJson: unknown): string {
  if (!isRecord(responseJson)) throw new Error("Unexpected Anthropic response");
  const content = responseJson["content"];
  const isUnknownArray = (v: unknown): v is unknown[] => Array.isArray(v);
  if (!isUnknownArray(content) || content.length === 0) throw new Error("Unexpected Anthropic response");
  const first = content[0];
  if (!isRecord(first)) throw new Error("Unexpected Anthropic response");
  const text = first["text"];
  if (typeof text !== "string") throw new Error("Unexpected Anthropic response");
  return text;
}

function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return m ? m[1].trim() : trimmed;
}

function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const t = stripJsonFences(text);

  // Try direct parse first
  try {
    return { ok: true, value: JSON.parse(t) as unknown };
  } catch {
    // Ignore and continue to extraction
  }

  // Try to extract JSON object
  const braceStart = t.indexOf("{");
  const braceEnd = t.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd !== -1 && braceEnd > braceStart) {
    const sub = t.slice(braceStart, braceEnd + 1);
    try {
      return { ok: true, value: JSON.parse(sub) as unknown };
    } catch {
      // Continue to array extraction
    }
  }

  // Try to extract JSON array
  const arrStart = t.indexOf("[");
  const arrEnd = t.lastIndexOf("]");
  if (arrStart !== -1 && arrEnd !== -1 && arrEnd > arrStart) {
    const sub = t.slice(arrStart, arrEnd + 1);
    try {
      return { ok: true, value: JSON.parse(sub) as unknown };
    } catch {
      // Continue to final error
    }
  }

  // Log first 200 chars for debugging
  const preview = t.slice(0, 200).replace(/\n/g, " ");
  return { ok: false, error: `Invalid JSON. Preview: ${preview}...` };
}

function parseWritesPayload(raw: unknown): LLMWrite[] {
  const isWrite = (v: unknown): v is LLMWrite =>
    isRecord(v) && typeof v["path"] === "string" && typeof v["content"] === "string";

  if (Array.isArray(raw) && raw.every(isWrite)) return raw;
  if (isRecord(raw) && Array.isArray(raw["writes"]) && (raw["writes"] as unknown[]).every(isWrite)) {
    return raw["writes"] as LLMWrite[];
  }
  throw new Error("Expected JSON writes: {writes:[{path,content}]}");
}

async function callAnthropicText(call: AnthropicCall): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: call.model,
        max_tokens: call.max_tokens,
        system: call.system,
        messages: [{ role: "user", content: call.user }]
      })
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Anthropic API request failed: ${msg}`);
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Anthropic API error: ${res.status} ${t}`);
  }
  const json: unknown = (await res.json()) as unknown;
  return extractJsonText(json);
}

async function callJsonWithRetry(call: AnthropicCall): Promise<unknown> {
  // First attempt
  const firstText = await callAnthropicText(call);
  const firstParsed = tryParseJson(firstText);
  if (firstParsed.ok) return firstParsed.value;

  // Second attempt with stricter instructions
  const strict: AnthropicCall = {
    ...call,
    system: "You are a JSON-only generator. Output ONLY raw JSON with no additional text.",
    user: `${call.user}\n\nIMPORTANT: Return ONLY the JSON object or array. Start your response with { or [. No other text before or after.`,
    max_tokens: call.max_tokens
  };
  const secondText = await callAnthropicText(strict);
  const secondParsed = tryParseJson(secondText);
  if (secondParsed.ok) return secondParsed.value;

  // Third attempt with explicit JSON request
  const veryStrict: AnthropicCall = {
    ...call,
    system: "Output raw JSON only. Nothing else.",
    user: `${call.user}\n\nReturn JSON starting with {`,
    max_tokens: call.max_tokens
  };
  const thirdText = await callAnthropicText(veryStrict);
  const thirdParsed = tryParseJson(thirdText);
  if (thirdParsed.ok) return thirdParsed.value;

  throw new Error(`Failed to get valid JSON after 3 attempts. Last error: ${thirdParsed.error}`);
}

export class AnthropicProvider implements LLMProvider {
  name = "anthropic";

  async generateSpec(nlPrompt: string, context: ProviderContext): Promise<SkillSpec> {
    const system = systemPromptBase();
    const user = [
      `Natural language request: ${JSON.stringify(nlPrompt)}`,
      "",
      "Return a JSON skill spec with keys:",
      "- name (kebab-case string)",
      "- description (string)",
      "- version (semver string, default 0.1.0)",
      "- authors (string[])",
      "- allowed_tools (string[])",
      "- entrypoints (string[]; MUST include scripts/run.cjs)",
      "- inputs (JSON schema object)",
      "- outputs (JSON schema object)",
      "- capabilities (optional string[])",
      "- runtime_dependencies (optional string[]; include playwright if requested)",
      "- policy {network:boolean, fs_read:string[], fs_write:string[], exec_allowlist:string[], domains_allowlist:string[]}",
      "- tests {golden:[{name?:string,input:any,expected?:any,assert?:{type,path,value}}]}",
      "",
      "Rules:",
      "- policy.network must be false unless explicitly required.",
      "- If Playwright is requested, include tests.golden case for missing dependency output:",
      '  expected.ok=false and expected.error.code="MISSING_DEP".',
      "",
      "IMPORTANT: Start your response with { and output only the JSON object. No other text."
    ].join("\n");

    const raw = await callJsonWithRetry({
      model: context.model ?? "claude-sonnet-4-5-latest",
      system,
      user,
      max_tokens: 1400
    });
    return normalizeSpec(raw);
  }

  async generateFilesFromSpec(spec: SkillSpec, context: ProviderContext): Promise<LLMResponse> {
    const system = systemPromptBase();
    const tree = context.existingFiles ?? {};
    const user = [
      "Generate skill files from this spec JSON:",
      JSON.stringify(spec, null, 2),
      "",
      "Current workspace tree (path -> content):",
      JSON.stringify(tree, null, 2),
      "",
      "Write ONLY these required files (and optionally resources/*):",
      "- SKILL.md (YAML frontmatter + Markdown body)",
      "- policy.yaml",
      "- scripts/run.cjs",
      "- tests/golden.json",
      "",
      "Constraints:",
      "- Entry point in SKILL.md must reference scripts/run.cjs.",
      "- scripts/run.cjs must be CommonJS, deterministic, stdin JSON -> stdout JSON.",
      "- If Playwright is required, implement missing-dependency branch with ok:false and error.code=MISSING_DEP, without crashing.",
      "- tests/golden.json must include a portable passing test for missing-dependency branch (no Playwright installed).",
      "",
      "IMPORTANT: Start your response with { and return ONLY the JSON object with writes array. No other text."
    ].join("\n");

    const raw = await callJsonWithRetry({
      model: context.model ?? "claude-sonnet-4-5-latest",
      system,
      user,
      max_tokens: 2600
    });
    const writes = parseWritesPayload(raw);
    return { writes };
  }

  async repairFromErrors(
    nlPrompt: string,
    context: ProviderContext,
    lintOutput: LintResult,
    testOutput: TestResult
  ): Promise<LLMResponse> {
    const system = systemPromptBase();
    const tree = context.existingFiles ?? {};
    const lintLines = lintOutput.issues
      .map((i) => `${i.severity.toUpperCase()} ${i.code}: ${i.message}${i.path ? ` (${i.path})` : ""}`)
      .join("\n");
    const testLines = testOutput.ok
      ? "OK"
      : testOutput.failures.map((f) => `FAIL ${f.testCase.name ?? "case"}: ${f.error}`).join("\n");

    const user = [
      `Original request: ${JSON.stringify(nlPrompt)}`,
      "",
      "Current workspace tree (path -> content):",
      JSON.stringify(tree, null, 2),
      "",
      "Lint output:",
      lintLines || "OK",
      "",
      "Test output:",
      testLines,
      "",
      "IMPORTANT: Return ONLY the JSON object starting with {",
      "Format: {\"writes\":[{\"path\":\"...\",\"content\":\"...\"}]}"
    ].join("\n");

    const raw = await callJsonWithRetry({
      model: context.model ?? "claude-sonnet-4-5-latest",
      system,
      user,
      max_tokens: 2600
    });
    const writes = parseWritesPayload(raw);
    return { writes };
  }

  async generateSkill(description: string, context: ProviderContext): Promise<LLMResponse> {
    const spec = await this.generateSpec(description, context);
    return this.generateFilesFromSpec(spec, context);
  }

  async repairSkill(description: string, context: ProviderContext, errors: string[]): Promise<LLMResponse> {
    const system = systemPromptBase();
    const tree = context.existingFiles ?? {};
    const user = [
      `Original request: ${JSON.stringify(description)}`,
      "",
      "Current workspace tree (path -> content):",
      JSON.stringify(tree, null, 2),
      "",
      "Errors:",
      errors.join("\n"),
      "",
      "IMPORTANT: Return ONLY the JSON object starting with {",
      "Format: {\"writes\":[{\"path\":\"...\",\"content\":\"...\"}]}"
    ].join("\n");
    const raw = await callJsonWithRetry({
      model: context.model ?? "claude-sonnet-4-5-latest",
      system,
      user,
      max_tokens: 2000
    });
    const writes = parseWritesPayload(raw);
    return { writes };
  }
}
