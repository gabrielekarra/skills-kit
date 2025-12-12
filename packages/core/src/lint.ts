import fs from "node:fs/promises";
import path from "node:path";
import { parseSkill } from "./skill.js";
import { readPolicy } from "./policy.js";
import { safeResolve } from "./utils/pathSafe.js";
import type { LintIssue, LintResult, SkillFrontmatter } from "./types.js";

const NAME_RE = /^[a-z0-9][a-z0-9-_]{1,64}$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(-[\w.-]+)?$/;

function req<T>(value: T | undefined, field: keyof SkillFrontmatter, issues: LintIssue[]) {
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
    issues.push({
      code: "FRONTMATTER_REQUIRED",
      message: `Missing required field: ${String(field)}`,
      path: "SKILL.md",
      severity: "error"
    });
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function lintSkill(skillDir: string): Promise<LintResult> {
  const issues: LintIssue[] = [];
  let parsed;
  try {
    parsed = await parseSkill(skillDir);
  } catch (err) {
    issues.push({
      code: "SKILL_PARSE",
      message: err instanceof Error ? err.message : "Failed to parse SKILL.md",
      path: "SKILL.md",
      severity: "error"
    });
    return { ok: false, issues };
  }

  const fm = parsed.frontmatter;

  req(fm.name, "name", issues);
  req(fm.description, "description", issues);
  req(fm.version, "version", issues);
  req(fm.authors, "authors", issues);
  req(fm.allowed_tools, "allowed_tools", issues);
  req(fm.entrypoints, "entrypoints", issues);
  req(fm.inputs, "inputs", issues);
  req(fm.outputs, "outputs", issues);

  if (typeof fm.name === "string" && !NAME_RE.test(fm.name)) {
    issues.push({
      code: "NAME_INVALID",
      message: "name must be kebab-case (a-z0-9-_)",
      path: "SKILL.md",
      severity: "error"
    });
  }
  if (typeof fm.version === "string" && !SEMVER_RE.test(fm.version)) {
    issues.push({
      code: "VERSION_INVALID",
      message: "version must be semver (x.y.z)",
      path: "SKILL.md",
      severity: "error"
    });
  }

  if (!Array.isArray(fm.authors)) {
    issues.push({
      code: "AUTHORS_TYPE",
      message: "authors must be an array of strings",
      path: "SKILL.md",
      severity: "error"
    });
  }
  if (!Array.isArray(fm.allowed_tools)) {
    issues.push({
      code: "TOOLS_TYPE",
      message: "allowed_tools must be an array of strings",
      path: "SKILL.md",
      severity: "error"
    });
  }
  if (!Array.isArray(fm.entrypoints) || fm.entrypoints.length === 0) {
    issues.push({
      code: "ENTRYPOINTS_TYPE",
      message: "entrypoints must be a non-empty array of strings",
      path: "SKILL.md",
      severity: "error"
    });
  } else {
    for (const ep of fm.entrypoints) {
      if (typeof ep !== "string") continue;
      try {
        const abs = safeResolve(skillDir, ep);
        if (!(await fileExists(abs))) {
          issues.push({
            code: "ENTRYPOINT_MISSING",
            message: `Entrypoint not found: ${ep}`,
            path: ep,
            severity: "error"
          });
        }
      } catch (err) {
        issues.push({
          code: "ENTRYPOINT_INVALID",
          message: err instanceof Error ? err.message : `Invalid entrypoint: ${ep}`,
          path: ep,
          severity: "error"
        });
      }
    }
  }

  const policy = await readPolicy(skillDir);
  if (policy.network) {
    issues.push({
      code: "POLICY_NETWORK_ON",
      message: "policy.network should be false by default",
      path: "policy.yaml",
      severity: "warning"
    });
  }
  if (fm.allowed_tools?.includes("exec") && policy.exec_allowlist.length === 0) {
    issues.push({
      code: "POLICY_EXEC_EMPTY",
      message: "allowed_tools includes exec but exec_allowlist is empty",
      path: "policy.yaml",
      severity: "warning"
    });
  }

  const goldenPath = safeResolve(skillDir, path.join("tests", "golden.json"));
  if (await fileExists(goldenPath)) {
    try {
      const goldenText = await fs.readFile(goldenPath, "utf8");
      const golden: unknown = JSON.parse(goldenText) as unknown;
      if (!Array.isArray(golden)) {
        issues.push({
          code: "GOLDEN_FORMAT",
          message: "tests/golden.json must be an array",
          path: "tests/golden.json",
          severity: "error"
        });
      }
    } catch (err) {
      issues.push({
        code: "GOLDEN_PARSE",
        message: err instanceof Error ? err.message : "Invalid golden.json",
        path: "tests/golden.json",
        severity: "error"
      });
    }
  }

  const ok = issues.every((i) => i.severity !== "error");
  return { ok, issues };
}
