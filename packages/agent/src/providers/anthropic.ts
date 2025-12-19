import type { LLMProvider, LLMResponse, LLMWrite, ProviderContext, SkillSpec, ContextAttachment } from "./types.js";

const API_URL = "https://api.anthropic.com/v1/messages";

function systemPromptBase() {
  return `You generate PRODUCTION-READY, COMPLETE code for skills-kit.
CRITICAL: Output ONLY raw JSON. No explanations. No markdown. No code blocks.

## Skill Structure
- SKILL.md: YAML frontmatter with ALL fields: name, description, version, authors, allowed_tools: [], entrypoints, inputs, outputs
- policy.yaml: network: false, fs_write: ["output/"]
- scripts/run.cjs: COMPLETE CommonJS code (NOT stubs or placeholders)
- package.json: Dependencies (use pdfkit for PDFs)

## PDF Generation with pdfkit
When generating PDFs, create COMPLETE styled code:
- Define COLORS: const COLORS = { primary: '#F26B6B', secondary: '#2BB5A0', text: '#2D3748', gray: '#718096', light: '#F7F7F7' }
- Header banner: doc.rect(0, 0, doc.page.width, 80).fill(COLORS.primary)
- Metrics grid: Calculate x/y for 3 columns, 2 rows layout
- Progress bars: doc.rect() for background and fill
- Ratings: '★'.repeat(Math.floor(rating)) + '☆'.repeat(5 - Math.floor(rating))
- Numbered circles: doc.circle(x, y, radius).fill(color)
- Page footers with doc.text('Page X of Y', 0, height-40, {align:'center', width: doc.page.width})

## Flexible Input Handling - Extract ALL Fields
The script must handle ANY data structure and display ALL fields:

1. Iterate through ALL keys in the input data
2. For nested objects, create sections and extract all their fields
3. For arrays, display all items as lists
4. Use fallback paths for common naming patterns
5. NEVER skip any data - every field must appear in the output

Example pattern:
const getValue = (paths, def) => paths.map(p => p.split('.').reduce((o,k) => o?.[k], data)).find(v => v != null) ?? def;
Object.entries(data).forEach(([key, value]) => { /* process and display */ });`;
}

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: string; data: string } };

type AnthropicCall = {
  model: string;
  system: string;
  user: string | ContentBlock[];
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

function toKebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
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
    name: toKebabCase(nameVal),
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
    policy: p
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

function buildUserContent(user: string | ContentBlock[]): string | ContentBlock[] {
  return user;
}

function attachmentsToContentBlocks(attachments: ContextAttachment[]): ContentBlock[] {
  return attachments.map((att) => {
    if (att.mimeType.startsWith("image/")) {
      return {
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: att.mimeType,
          data: att.data
        }
      };
    }
    // PDF and other documents
    return {
      type: "document" as const,
      source: {
        type: "base64" as const,
        media_type: att.mimeType,
        data: att.data
      }
    };
  });
}

function buildMultimodalContent(text: string, attachments?: ContextAttachment[]): string | ContentBlock[] {
  if (!attachments || attachments.length === 0) {
    return text;
  }
  const blocks: ContentBlock[] = attachmentsToContentBlocks(attachments);
  blocks.push({ type: "text", text });
  return blocks;
}

function appendUserText(user: string | ContentBlock[], extraText: string): string | ContentBlock[] {
  if (typeof user === "string") {
    return `${user}\n\n${extraText}`;
  }
  return [...user, { type: "text", text: extraText }];
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
        messages: [{ role: "user", content: buildUserContent(call.user) }]
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
    user: appendUserText(
      call.user,
      "IMPORTANT: Return ONLY the JSON object or array. Start your response with { or [. No other text before or after."
    ),
    max_tokens: call.max_tokens
  };
  const secondText = await callAnthropicText(strict);
  const secondParsed = tryParseJson(secondText);
  if (secondParsed.ok) return secondParsed.value;

  // Third attempt with explicit JSON request
  const veryStrict: AnthropicCall = {
    ...call,
    system: "Output raw JSON only. Nothing else.",
    user: appendUserText(call.user, "Return JSON starting with {"),
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
    const attachmentNote = context.attachments && context.attachments.length > 0
      ? `\n\nIMPORTANT: Reference files (${context.attachments.map(a => a.filename).join(", ")}) are provided as visual context and are copied into resources/ (${context.attachments.map(a => `resources/${a.filename}`).join(", ")}). Analyze them carefully to understand the exact layout, structure, and design to replicate. If a PDF template is provided, use Playwright with HTML/CSS to match the styling.`
      : "";
    const userText = [
      `Natural language request: ${JSON.stringify(nlPrompt)}${attachmentNote}`,
      "",
      "Return a JSON skill spec with ALL these required keys:",
      "- name (kebab-case string)",
      "- description (string)",
      "- version (semver string, default 1.0.0)",
      "- authors: [\"skills-kit\"]",
      "- allowed_tools: [] (empty array unless specific tools needed)",
      "- entrypoints: [\"scripts/run.cjs\"]",
      "- inputs: { type: \"object\", additionalProperties: true } (flexible, no required fields)",
      "- outputs: { type: \"object\", properties: { ok: { type: \"boolean\" } } }",
      "- runtime_dependencies (optional string[]; use pdfkit for PDF generation)",
      "- policy: { network: false, fs_read: [], fs_write: [\"output/\"], exec_allowlist: [], domains_allowlist: [] }",
      "",
      "Rules:",
      "- For PDF generation, prefer pdfkit over Playwright (simpler, no browser).",
      "- If skill generates files, set policy.fs_write to [\"output/\"].",
      "",
      "IMPORTANT: Start your response with { and output only the JSON object. No other text."
    ].join("\n");

    const raw = await callJsonWithRetry({
      model: context.model ?? "claude-sonnet-4-20250514",
      system,
      user: buildMultimodalContent(userText, context.attachments),
      max_tokens: 1400
    });
    return normalizeSpec(raw);
  }

  async generateFilesFromSpec(spec: SkillSpec, context: ProviderContext): Promise<LLMResponse> {
    const system = systemPromptBase();
    const tree = context.existingFiles ?? {};
    const hasPdfTemplate = context.attachments?.some(a => a.mimeType === 'application/pdf');

    const attachmentNote = context.attachments && context.attachments.length > 0
      ? `\n\nIMPORTANT: A PDF template is provided. Analyze it carefully and replicate:
- Exact color scheme (coral #F26B6B, teal #2BB5A0, etc.)
- Layout structure (header banners, content sections, footers)
- Typography (font sizes, weights, alignment)
- Visual elements (colored rectangles, progress bars, rating stars, numbered circles)
- Data sections (metrics grids, comparison bars, review quotes, recommendations)`
      : "";

    const pdfInstructions = hasPdfTemplate ? `
PDF CODE REQUIREMENTS:
1. Analyze the template to extract colors, layout, and structure
2. Define COLORS object matching the template's color scheme
3. Iterate through ALL input data keys and create sections for each
4. For objects: create titled sections with their fields
5. For arrays: create lists with bullets or numbered items
6. For numeric data: consider grids or visual representations
7. Use pdfkit methods: doc.rect(), doc.circle(), doc.text(), doc.fontSize(), doc.fillColor()
8. Handle multi-page with doc.addPage() if content is long
9. Add page footers
10. CRITICAL: Display EVERY field from the input - nothing should be omitted
11. Output to 'output/' directory
` : "";

    const userText = [
      "Generate skill files from this spec JSON:",
      JSON.stringify(spec, null, 2),
      "",
      "Required files:",
      "1. SKILL.md with ALL frontmatter fields (name, description, version, authors, allowed_tools: [], entrypoints, inputs, outputs)",
      "2. policy.yaml (network: false, fs_write: [\"output/\"])",
      "3. scripts/run.cjs - COMPLETE, PRODUCTION-READY code",
      "4. package.json with dependencies",
      "",
      "scripts/run.cjs MUST:",
      "- require('fs'), require('path') at top, plus any needed dependencies",
      "- Iterate through ALL keys in the input data",
      "- Create sections/displays for EVERY piece of data",
      "- For objects: extract and display all their fields",
      "- For arrays: display all items",
      "- For numbers: show with appropriate formatting",
      "- NOTHING should be skipped - display ALL input data",
      pdfInstructions,
      attachmentNote,
      "",
      "CRITICAL: Generate COMPLETE implementation that displays ALL input fields.",
      "Return {writes:[{path,content}]}"
    ].join("\n");

    const raw = await callJsonWithRetry({
      model: context.model ?? "claude-sonnet-4-20250514",
      system,
      user: buildMultimodalContent(userText, context.attachments),
      max_tokens: 16000
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
      model: context.model ?? "claude-sonnet-4-20250514",
      system,
      user,
      max_tokens: 2000
    });
    const writes = parseWritesPayload(raw);
    return { writes };
  }
}
