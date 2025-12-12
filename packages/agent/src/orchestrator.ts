import fs from "node:fs/promises";
import path from "node:path";
import { lintSkill, runGoldenTests, safeResolve } from "@skills-kit/core";
import type { LLMProvider, LLMResponse, LLMWrite, ProviderContext, SkillSpec } from "./providers/types.js";
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
    ["scripts", "tests", "resources"].map((d) => fs.mkdir(path.join(skillDir, d), { recursive: true }))
  );
}

function isAllowedSkillWritePath(p: string): boolean {
  const posix = p.replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (posix === "SKILL.md" || posix === "policy.yaml") return true;
  return (
    posix.startsWith("scripts/") ||
    posix.startsWith("tests/") ||
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

function hasAnthropicBuilder(provider: LLMProvider): provider is LLMProvider & {
  generateSpec: (nlPrompt: string, context: ProviderContext) => Promise<SkillSpec>;
  generateFilesFromSpec: (spec: SkillSpec, context: ProviderContext) => Promise<LLMResponse>;
  repairFromErrors: NonNullable<LLMProvider["repairFromErrors"]>;
} {
  return (
    typeof provider.generateSpec === "function" &&
    typeof provider.generateFilesFromSpec === "function" &&
    typeof provider.repairFromErrors === "function"
  );
}

export type CreateOptions = {
  provider: LLMProvider;
  model?: string;
  maxIters?: number;
};

export async function createSkill(description: string, outDir: string, opts: CreateOptions) {
  const maxIters = opts.maxIters ?? 5;
  await ensureSkillSkeleton(outDir);
  const ctx: ProviderContext = { model: opts.model };
  if (hasAnthropicBuilder(opts.provider)) {
    const spec = await opts.provider.generateSpec(description, ctx);
    const existingFiles = await collectExistingFiles(outDir);
    const initial = await opts.provider.generateFilesFromSpec(spec, { ...ctx, existingFiles });
    await applyResponse(outDir, initial);

    for (let i = 0; i < maxIters; i++) {
      const lint = await lintSkill(outDir);
      const tests = await runGoldenTests(outDir);
      if (lint.ok && tests.ok) {
        return { ok: true, lint, tests, iterations: i };
      }
      const existingFiles2 = await collectExistingFiles(outDir);
      const repair = await opts.provider.repairFromErrors(description, { ...ctx, existingFiles: existingFiles2 }, lint, tests);
      await applyResponse(outDir, repair);
    }

    const lint = await lintSkill(outDir);
    const tests = await runGoldenTests(outDir);
    return { ok: false, lint, tests, iterations: maxIters };
  }

  const first = await opts.provider.generateSkill(description, ctx);
  await applyResponse(outDir, first);

  for (let i = 0; i < maxIters; i++) {
    const lint = await lintSkill(outDir);
    const tests = await runGoldenTests(outDir);
    if (lint.ok && tests.ok) {
      return { ok: true, lint, tests, iterations: i };
    }
    const errors = [
      ...lint.issues.filter((x) => x.severity === "error").map((x) => `${x.code}: ${x.message}`),
      ...tests.failures.map((f) => `TEST: ${f.error}`)
    ];
    const existingFiles = await collectExistingFiles(outDir);
    const repair = await opts.provider.repairSkill(description, { model: opts.model, existingFiles }, errors);
    await applyResponse(outDir, repair);
  }

  const lint = await lintSkill(outDir);
  const tests = await runGoldenTests(outDir);
  return { ok: false, lint, tests, iterations: maxIters };
}

export async function refineSkill(skillDir: string, changeRequest: string, opts: CreateOptions) {
  const maxIters = opts.maxIters ?? 5;
  await ensureSkillSkeleton(skillDir);
  const ctx: ProviderContext = { model: opts.model };
  const refinePrompt = `Refine skill with change: ${changeRequest}`;

  if (typeof opts.provider.repairFromErrors === "function") {
    const lint0 = await lintSkill(skillDir);
    const tests0 = await runGoldenTests(skillDir);
    const existingFiles0 = await collectExistingFiles(skillDir);
    await applyResponse(
      skillDir,
      await opts.provider.repairFromErrors(refinePrompt, { ...ctx, existingFiles: existingFiles0 }, lint0, tests0)
    );

    for (let i = 0; i < maxIters; i++) {
      const lint = await lintSkill(skillDir);
      const tests = await runGoldenTests(skillDir);
      if (lint.ok && tests.ok) return { ok: true, lint, tests, iterations: i };
      const existingFiles = await collectExistingFiles(skillDir);
      await applyResponse(
        skillDir,
        await opts.provider.repairFromErrors(refinePrompt, { ...ctx, existingFiles }, lint, tests)
      );
    }
    const lint = await lintSkill(skillDir);
    const tests = await runGoldenTests(skillDir);
    return { ok: false, lint, tests, iterations: maxIters };
  }

  let existingFiles = await collectExistingFiles(skillDir);
  await applyResponse(
    skillDir,
    await opts.provider.repairSkill(refinePrompt, { ...ctx, existingFiles }, [])
  );

  for (let i = 0; i < maxIters; i++) {
    const lint = await lintSkill(skillDir);
    const tests = await runGoldenTests(skillDir);
    if (lint.ok && tests.ok) return { ok: true, lint, tests, iterations: i };
    const errors = [
      ...lint.issues.filter((x) => x.severity === "error").map((x) => `${x.code}: ${x.message}`),
      ...tests.failures.map((f) => `TEST: ${f.error}`)
    ];
    existingFiles = await collectExistingFiles(skillDir);
    const repair = await opts.provider.repairSkill(refinePrompt, { ...ctx, existingFiles }, errors);
    await applyResponse(skillDir, repair);
  }

  const lint = await lintSkill(skillDir);
  const tests = await runGoldenTests(skillDir);
  return { ok: false, lint, tests, iterations: maxIters };
}
