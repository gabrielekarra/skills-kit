import fs from "node:fs/promises";
import path from "node:path";
import { safeResolve } from "@skills-kit/core";
import type { ContextAttachment, LLMProvider, LLMResponse, LLMWrite, ProviderContext, SkillSpec } from "./providers/types.js";
import { applyUnifiedDiff, applyWrites } from "./patchApply.js";

async function collectExistingFiles(skillDir: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const stack: string[] = [""];
  while (stack.length) {
    const rel = stack.pop()!;
    const abs = safeResolve(skillDir, rel || ".");
    const entries = await fs.readdir(abs, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.name === "node_modules" || ent.name === "dist" || ent.name === ".git") continue;
      const childRel = rel ? path.join(rel, ent.name) : ent.name;
      if (ent.isDirectory()) stack.push(childRel);
      else if (ent.isFile()) {
        const p = safeResolve(skillDir, childRel);
        const txt = await fs.readFile(p, "utf8");
        files[childRel.replace(/\\/g, "/")] = txt;
      }
    }
  }
  return files;
}

function isLLMWrite(value: unknown): value is LLMWrite {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  return typeof rec.path === "string" && typeof rec.content === "string";
}

function isWriteArray(value: unknown): value is LLMWrite[] {
  return Array.isArray(value) && value.every(isLLMWrite);
}

async function ensureSkillSkeleton(skillDir: string) {
  await fs.mkdir(skillDir, { recursive: true });
  await Promise.all(
    ["scripts", "resources"].map((d) => fs.mkdir(path.join(skillDir, d), { recursive: true }))
  );
}

function isAllowedSkillWritePath(p: string): boolean {
  const posix = p.replace(/\\/g, "/").replace(/^\.\/+/, "");
  const allowedRootFiles = [
    "SKILL.md",
    "policy.yaml",
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    ".gitignore",
    "README.md"
  ];
  if (allowedRootFiles.includes(posix)) return true;
  return (
    posix.startsWith("scripts/") ||
    posix.startsWith("resources/")
  );
}

async function applyResponse(skillDir: string, res: LLMResponse) {
  if (isWriteArray(res.writes)) {
    for (const w of res.writes) {
      if (!isAllowedSkillWritePath(w.path)) {
        throw new Error(`Disallowed write path: ${w.path}`);
      }
    }
    await applyWrites(skillDir, res.writes);
  } else if (typeof res.patch === "string" && res.patch.trim().length > 0) {
    await applyUnifiedDiff(skillDir, res.patch);
  }
}

function hasSpecBuilder(provider: LLMProvider): provider is LLMProvider & {
  generateSpec: (nlPrompt: string, context: ProviderContext) => Promise<SkillSpec>;
  generateFilesFromSpec: (spec: SkillSpec, context: ProviderContext) => Promise<LLMResponse>;
} {
  return (
    typeof provider.generateSpec === "function" &&
    typeof provider.generateFilesFromSpec === "function"
  );
}

export type CreateOptions = {
  provider: LLMProvider;
  model?: string;
  attachments?: ContextAttachment[];
};

export async function createSkill(description: string, outDir: string, opts: CreateOptions) {
  await ensureSkillSkeleton(outDir);
  const ctx: ProviderContext = { model: opts.model, attachments: opts.attachments };
  if (hasSpecBuilder(opts.provider)) {
    const spec = await opts.provider.generateSpec(description, ctx);
    const existingFiles = await collectExistingFiles(outDir);
    const initial = await opts.provider.generateFilesFromSpec(spec, { ...ctx, existingFiles });
    await applyResponse(outDir, initial);
    return { ok: true, iterations: 0, spec };
  }

  const first = await opts.provider.generateSkill(description, ctx);
  await applyResponse(outDir, first);
  return { ok: true, iterations: 0 };
}

export async function refineSkill(skillDir: string, changeRequest: string, opts: CreateOptions) {
  await ensureSkillSkeleton(skillDir);
  const ctx: ProviderContext = { model: opts.model };
  const refinePrompt = `Refine skill with change: ${changeRequest}`;
  const existingFiles = await collectExistingFiles(skillDir);
  const res = await opts.provider.repairSkill(refinePrompt, { ...ctx, existingFiles }, []);
  await applyResponse(skillDir, res);
  return { ok: true, iterations: 0 };
}
