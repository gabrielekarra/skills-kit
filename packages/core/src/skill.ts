import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { ParsedSkill, SkillFrontmatter } from "./types.js";
import { safeResolve } from "./utils/pathSafe.js";

function extractFrontmatter(markdown: string): { raw: unknown; body: string } {
  const lines = markdown.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    throw new Error("SKILL.md must start with YAML frontmatter delimited by ---");
  }
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      end = i;
      break;
    }
  }
  if (end === -1) {
    throw new Error("SKILL.md frontmatter is missing closing ---");
  }
  const yamlBlock = lines.slice(1, end).join("\n");
  const body = lines.slice(end + 1).join("\n").trimStart();
  const raw: unknown = parseYaml(yamlBlock);
  return { raw, body };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function asStringArray(value: unknown): string[] | undefined {
  if (typeof value === "string") return [value];
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) return value;
  return undefined;
}

function normalizeFrontmatter(raw: unknown): SkillFrontmatter {
  if (!isRecord(raw)) {
    throw new Error("Frontmatter must be a YAML object");
  }

  const nameVal = raw["name"];
  const descVal = raw["description"];
  if (!isNonEmptyString(nameVal)) {
    throw new Error("Frontmatter.name must be a non-empty string");
  }
  if (!isNonEmptyString(descVal)) {
    throw new Error("Frontmatter.description must be a non-empty string");
  }

  const reserved = new Set([
    "name",
    "description",
    "version",
    "authors",
    "allowed_tools",
    "entrypoints",
    "capabilities",
    "inputs",
    "outputs",
    "policy",
    "tests"
  ]);
  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!reserved.has(k)) extras[k] = v;
  }

  const fm: SkillFrontmatter = {
    name: nameVal.trim(),
    description: descVal.trim(),
    inputs: raw["inputs"],
    outputs: raw["outputs"],
    policy: raw["policy"],
    tests: raw["tests"],
    ...extras
  };

  const versionVal = raw["version"];
  if (typeof versionVal === "string") fm.version = versionVal.trim();

  const authorsArr = asStringArray(raw["authors"]);
  if (authorsArr) fm.authors = authorsArr;

  const toolsArr = asStringArray(raw["allowed_tools"]);
  if (toolsArr) fm.allowed_tools = toolsArr;

  const entryArr = asStringArray(raw["entrypoints"]);
  if (entryArr) fm.entrypoints = entryArr;

  const capArr = asStringArray(raw["capabilities"]);
  if (capArr) fm.capabilities = capArr;

  return fm;
}

export async function parseSkill(skillDir: string): Promise<ParsedSkill> {
  const skillPath = safeResolve(skillDir, "SKILL.md");
  const markdown = await fs.readFile(skillPath, "utf8");
  const { raw, body } = extractFrontmatter(markdown);
  const frontmatter = normalizeFrontmatter(raw);
  return {
    dir: path.resolve(skillDir),
    skillPath,
    frontmatter,
    body,
    rawFrontmatter: raw
  };
}
