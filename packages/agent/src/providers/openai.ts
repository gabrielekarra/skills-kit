import type { LLMProvider, LLMResponse, LLMWrite, ProviderContext, SkillSpec, ContextAttachment } from "./types.js";

const API_URL = "https://api.openai.com/v1/chat/completions";

function systemPromptBase() {
  return `You are an expert skill generator for the skills-kit framework. You generate PRODUCTION-READY, COMPLETE code.

## What is skills-kit?
skills-kit is a framework for creating portable AI skills. Skills receive JSON via stdin and output JSON via stdout.

## Skill Structure
- SKILL.md: YAML frontmatter with ALL fields: name, description, version, authors, allowed_tools: [], entrypoints, inputs, outputs
- policy.yaml: Security policy (network: false, fs_write: ["output/"])
- scripts/run.cjs: Main entrypoint (CommonJS)
- package.json: Dependencies (use pdfkit for PDFs)

## Critical Rules
1. Output ONLY raw JSON. No explanations, no markdown.
2. scripts/run.cjs must be COMPLETE, PRODUCTION-READY code - NOT stubs or placeholders
3. Always require('fs') and require('path') at top of scripts

## PDF Generation with pdfkit
When generating PDFs, use pdfkit with FULL styling:
- Define color constants: const COLORS = { primary: '#F26B6B', secondary: '#2BB5A0', text: '#2D3748', gray: '#718096' }
- Use doc.rect() for colored backgrounds and banners
- Use doc.fontSize(), doc.font('Helvetica-Bold'), doc.fillColor() for typography
- Create grids by calculating x/y positions for each element
- Add visual elements: progress bars, rating stars, numbered circles
- Use doc.circle(), doc.rect() for shapes
- Save to 'output/' directory

## Flexible Input Handling - Extract ALL Fields Dynamically
The script must handle ANY data structure. Analyze the input and extract ALL fields:

1. Use recursive extraction to find all nested objects and arrays
2. For each field, provide multiple fallback paths for common naming patterns
3. Display ALL extracted data in the output - don't skip any fields
4. Group related fields into logical sections

Pattern for extracting fields with fallbacks:
\`\`\`javascript
// Extract with multiple fallback paths
const getValue = (paths, defaultVal) => {
  for (const path of paths) {
    const val = path.split('.').reduce((o, k) => o?.[k], data);
    if (val !== undefined && val !== null) return val;
  }
  return defaultVal;
};

// Extract top-level sections
const mainSection = data.property || data.details || data.info || data;

// Extract ALL fields from each section - iterate over keys
Object.keys(data).forEach(key => {
  // Process each section and display its contents
});
\`\`\`

CRITICAL: The generated code must display EVERY piece of data from the input, organized into appropriate sections based on the data structure.

## scripts/run.cjs Template for PDF Skills
\`\`\`javascript
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const COLORS = { primary: '#F26B6B', secondary: '#2BB5A0', text: '#2D3748', gray: '#718096', light: '#F7F7F7' };

let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  try {
    const data = JSON.parse(input || "{}");

    const outputDir = 'output';
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const pdfPath = path.join(outputDir, 'report.pdf');

    const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 50, right: 50 } });
    const writeStream = fs.createWriteStream(pdfPath);
    doc.pipe(writeStream);

    // Header, content sections, iterate through ALL data fields...

    doc.end();
    // IMPORTANT: Use writeStream.on('finish'), NOT doc.on('finish')
    writeStream.on('finish', () => console.log(JSON.stringify({ ok: true, pdfPath })));
  } catch (err) {
    console.log(JSON.stringify({ ok: false, error: { message: err.message } }));
  }
});
\`\`\``;
}

type OpenAIMessage = {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
};

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: string } };

type OpenAITool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
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

  return {
    name: toKebabCase(nameVal),
    description: descVal.trim(),
    version: typeof raw["version"] === "string" ? raw["version"] : "0.1.0",
    authors: isStringArray(raw["authors"]) ? raw["authors"] : ["skills-kit"],
    allowed_tools: isStringArray(raw["allowed_tools"]) ? raw["allowed_tools"] : [],
    entrypoints: ["scripts/run.cjs"],
    inputs: raw["inputs"] ?? { type: "object", additionalProperties: true },
    outputs: raw["outputs"] ?? {},
    runtime_dependencies: isStringArray(raw["runtime_dependencies"]) ? raw["runtime_dependencies"] : undefined,
    policy: p
  };
}

function extractToolArguments(responseJson: unknown, toolName: string): string {
  if (!isRecord(responseJson)) throw new Error("Unexpected OpenAI response");

  const choices = responseJson["choices"];
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error("No choices in response");
  }

  const first = choices[0];
  if (!isRecord(first)) throw new Error("Invalid choice format");

  const message = first["message"];
  if (!isRecord(message)) throw new Error("No message in choice");

  const toolCalls = message["tool_calls"];
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
    // Try to get content as fallback
    const content = message["content"];
    if (typeof content === "string" && content.trim()) {
      return content;
    }
    throw new Error("No tool calls in response");
  }

  for (const tc of toolCalls) {
    if (!isRecord(tc)) continue;
    const func = tc["function"];
    if (!isRecord(func)) continue;
    if (func["name"] !== toolName) continue;
    const args = func["arguments"];
    if (typeof args === "string") return args;
  }

  throw new Error(`Tool ${toolName} not found in response`);
}

function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const trimmed = text.trim();
  // Remove markdown code fences if present
  const cleaned = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

  try {
    return { ok: true, value: JSON.parse(cleaned) };
  } catch {
    // Try to extract JSON object
    const braceStart = cleaned.indexOf("{");
    const braceEnd = cleaned.lastIndexOf("}");
    if (braceStart !== -1 && braceEnd > braceStart) {
      try {
        return { ok: true, value: JSON.parse(cleaned.slice(braceStart, braceEnd + 1)) };
      } catch {
        // Fall through
      }
    }
    return { ok: false, error: `Invalid JSON: ${cleaned.slice(0, 100)}...` };
  }
}

function parseWritesPayload(raw: unknown): LLMWrite[] {
  const isWrite = (v: unknown): v is LLMWrite =>
    isRecord(v) && typeof v["path"] === "string" && typeof v["content"] === "string";

  if (Array.isArray(raw) && raw.every(isWrite)) return raw;
  if (isRecord(raw) && Array.isArray(raw["writes"]) && (raw["writes"] as unknown[]).every(isWrite)) {
    return raw["writes"] as LLMWrite[];
  }
  throw new Error("Expected {writes:[{path,content}]}");
}

function buildMultimodalContent(text: string, attachments?: ContextAttachment[]): string | ContentPart[] {
  if (!attachments || attachments.length === 0) {
    return text;
  }

  const parts: ContentPart[] = [];

  // Add images first
  for (const att of attachments) {
    if (att.mimeType.startsWith("image/")) {
      parts.push({
        type: "image_url",
        image_url: {
          url: `data:${att.mimeType};base64,${att.data}`,
          detail: "high"
        }
      });
    }
  }

  // Add text last
  parts.push({ type: "text", text });
  return parts;
}

async function callOpenAI(
  messages: OpenAIMessage[],
  model: string,
  maxTokens: number,
  tools?: OpenAITool[],
  toolChoice?: { type: "function"; function: { name: string } }
): Promise<unknown> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: maxTokens
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
    if (toolChoice) {
      body.tool_choice = toolChoice;
    }
  }

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${text}`);
  }

  return res.json();
}

function buildSpecTool(): OpenAITool {
  return {
    type: "function",
    function: {
      name: "emit_skill_spec",
      description: "Return a skills-kit SkillSpec JSON object",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          version: { type: "string" },
          runtime_dependencies: { type: "array", items: { type: "string" } },
          policy: {
            type: "object",
            properties: {
              network: { type: "boolean" },
              fs_read: { type: "array", items: { type: "string" } },
              fs_write: { type: "array", items: { type: "string" } },
              exec_allowlist: { type: "array", items: { type: "string" } },
              domains_allowlist: { type: "array", items: { type: "string" } }
            }
          }
        },
        required: ["name", "description", "policy"]
      }
    }
  };
}

function buildWritesTool(): OpenAITool {
  return {
    type: "function",
    function: {
      name: "emit_writes",
      description: "Return files to write: {writes:[{path,content}]}",
      parameters: {
        type: "object",
        properties: {
          writes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                path: { type: "string" },
                content: { type: "string" }
              },
              required: ["path", "content"]
            }
          }
        },
        required: ["writes"]
      }
    }
  };
}

export class OpenAIProvider implements LLMProvider {
  name = "openai";

  async generateSpec(nlPrompt: string, context: ProviderContext): Promise<SkillSpec> {
    const model = context.model ?? process.env.OPENAI_MODEL ?? "gpt-4o";

    const attachmentNote = context.attachments?.length
      ? `\n\nReference files provided: ${context.attachments.map(a => a.filename).join(", ")}. These are copied to resources/. Analyze and replicate the design.`
      : "";

    const userContent = buildMultimodalContent(
      `Create a skill for: ${nlPrompt}${attachmentNote}\n\nReturn the skill spec JSON.`,
      context.attachments
    );

    const messages: OpenAIMessage[] = [
      { role: "system", content: systemPromptBase() },
      { role: "user", content: userContent }
    ];

    const tool = buildSpecTool();
    const response = await callOpenAI(messages, model, 4096, [tool], {
      type: "function",
      function: { name: tool.function.name }
    });

    const argsText = extractToolArguments(response, tool.function.name);
    const parsed = tryParseJson(argsText);
    if (!parsed.ok) throw new Error(parsed.error);
    return normalizeSpec(parsed.value);
  }

  async generateFilesFromSpec(spec: SkillSpec, context: ProviderContext): Promise<LLMResponse> {
    const model = context.model ?? process.env.OPENAI_MODEL ?? "gpt-4o";

    const hasPdfTemplate = context.attachments?.some(a => a.mimeType === 'application/pdf');

    const attachmentNote = context.attachments?.length
      ? `\n\nIMPORTANT: A PDF template is provided. You MUST:
1. First, analyze the template and define a LAYOUT constant describing EVERY element:
   - Page structure (margins, header height, section positions)
   - Color palette (extract exact hex colors)
   - Each section with its y-position and content type
2. Then generate code that uses this LAYOUT to position elements precisely`
      : "";

    const pdfInstructions = hasPdfTemplate ? `
PDF GENERATION - CREATE PRECISE LAYOUT:

STEP 1: Define layout constants based on template analysis:
\`\`\`javascript
const COLORS = {
  primary: '#F26B6B',    // Header background color from template
  secondary: '#2BB5A0',  // Accent color for values
  text: '#2D3748',       // Main text color
  gray: '#718096',       // Secondary text
  light: '#F7F7F7'       // Background sections
};

const LAYOUT = {
  page: { width: 595, height: 842 },  // A4 dimensions
  margins: { top: 50, left: 50, right: 50, bottom: 50 },
  header: { y: 0, height: 80 },
  sections: [
    { name: 'propertyInfo', y: 100, height: 60 },
    { name: 'metricsGrid', y: 180, cols: 3, rows: 2, cellWidth: 160, cellHeight: 80 },
    { name: 'comparison', y: 420, height: 120 },
    // ... define ALL sections from template
  ]
};
\`\`\`

STEP 2: Generate rendering code using exact positions:
- Header: doc.rect(0, LAYOUT.header.y, doc.page.width, LAYOUT.header.height).fill(COLORS.primary)
- Each section: use LAYOUT.sections[i].y for vertical position
- Grid items: x = margins.left + (col * cellWidth), y = section.y + (row * cellHeight)

STEP 3: Display ALL input data in appropriate sections

IMPORTANT: Use writeStream.on('finish'), NOT doc.on('finish') for the callback
` : "";

    const userContent = buildMultimodalContent(
      `Generate skill files for this spec:\n${JSON.stringify(spec, null, 2)}${attachmentNote}\n\n` +
      `Required files:\n` +
      `1. SKILL.md - YAML frontmatter with ALL fields: name, description, version, authors, allowed_tools: [], entrypoints, inputs: {type: object, additionalProperties: true}, outputs\n` +
      `2. policy.yaml - network: false, fs_write: ["output/"]\n` +
      `3. scripts/run.cjs - COMPLETE implementation that processes ALL input data\n` +
      `4. package.json with any required dependencies\n\n` +
      `scripts/run.cjs MUST:\n` +
      `- Iterate through ALL keys in the input data\n` +
      `- Create sections/displays for EVERY piece of data\n` +
      `- For objects: extract and display all their fields\n` +
      `- For arrays: display all items\n` +
      `- NOTHING should be skipped - display ALL input data\n\n` +
      pdfInstructions +
      `CRITICAL: Generate COMPLETE implementation that displays ALL input fields.\n` +
      `Return {writes:[{path,content}]}`,
      context.attachments
    );

    const messages: OpenAIMessage[] = [
      { role: "system", content: systemPromptBase() },
      { role: "user", content: userContent }
    ];

    const tool = buildWritesTool();
    const response = await callOpenAI(messages, model, 16384, [tool], {
      type: "function",
      function: { name: tool.function.name }
    });

    const argsText = extractToolArguments(response, tool.function.name);
    const parsed = tryParseJson(argsText);
    if (!parsed.ok) throw new Error(parsed.error);
    return { writes: parseWritesPayload(parsed.value) };
  }

  async generateSkill(description: string, context: ProviderContext): Promise<LLMResponse> {
    const spec = await this.generateSpec(description, context);
    return this.generateFilesFromSpec(spec, context);
  }

  async repairSkill(description: string, context: ProviderContext, errors: string[]): Promise<LLMResponse> {
    const model = context.model ?? process.env.OPENAI_MODEL ?? "gpt-4o";
    const tree = context.existingFiles ?? {};

    const messages: OpenAIMessage[] = [
      { role: "system", content: systemPromptBase() },
      {
        role: "user",
        content: `Fix this skill.\n\nOriginal request: ${description}\n\nCurrent files:\n${JSON.stringify(tree, null, 2)}\n\nErrors:\n${errors.join("\n")}\n\nReturn {writes:[{path,content}]}`
      }
    ];

    const tool = buildWritesTool();
    const response = await callOpenAI(messages, model, 8192, [tool], {
      type: "function",
      function: { name: tool.function.name }
    });

    const argsText = extractToolArguments(response, tool.function.name);
    const parsed = tryParseJson(argsText);
    if (!parsed.ok) throw new Error(parsed.error);
    return { writes: parseWritesPayload(parsed.value) };
  }
}
