import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import type { AssertRule, GoldenTestCase, TestFailure, TestResult } from "./types.js";
import { parseSkill } from "./skill.js";
import { safeResolve } from "./utils/pathSafe.js";

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

function getAtPath(obj: unknown, jsonPath: string): unknown {
  const parts = jsonPath.split(".").filter(Boolean);
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur == null) return undefined;
    if (typeof cur !== "object") return undefined;
    const rec = cur as Record<string, unknown>;
    cur = rec[part];
  }
  return cur;
}

function applyAssert(rule: AssertRule, actual: unknown) {
  const v = getAtPath(actual, rule.path);
  if (rule.type === "contains") {
    if (typeof v === "string") {
      assert.ok(v.includes(String(rule.value)));
    } else if (Array.isArray(v)) {
      assert.ok(v.some((x) => JSON.stringify(x) === JSON.stringify(rule.value)));
    } else {
      assert.deepEqual(v, rule.value);
    }
  } else if (rule.type === "matches") {
    const re = new RegExp(rule.value);
    assert.ok(re.test(String(v)));
  }
}

export function runEntrypoint(entryAbs: string, input: unknown, cwd: string): unknown {
  const proc = spawnSync(process.execPath, [entryAbs], {
    cwd,
    input: JSON.stringify(input ?? {}),
    encoding: "utf8",
    maxBuffer: 1024 * 1024
  });
  if (proc.error) throw proc.error;
  if (proc.status !== 0) {
    throw new Error(proc.stderr || `Entrypoint exited ${proc.status}`);
  }
  const out = (proc.stdout || "").trim();
  if (!out) return null;
  return JSON.parse(out) as unknown;
}

export async function runGoldenTests(skillDir: string): Promise<TestResult> {
  const failures: TestFailure[] = [];
  let cases: GoldenTestCase[] = [];
  const goldenPath = safeResolve(skillDir, path.join("tests", "golden.json"));
  if (await fileExists(goldenPath)) {
    const text = await fs.readFile(goldenPath, "utf8");
    const parsed: unknown = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) {
      cases = parsed as GoldenTestCase[];
    }
  }

  if (cases.length === 0) {
    return { ok: true, passed: 0, failed: 0, failures: [] };
  }

  const parsed = await parseSkill(skillDir);
  const ep = parsed.frontmatter.entrypoints?.[0];
  if (!ep || typeof ep !== "string") {
    return {
      ok: false,
      passed: 0,
      failed: cases.length,
      failures: cases.map((c) => ({ testCase: c, error: "No entrypoint defined" }))
    };
  }
  const entryAbs = safeResolve(skillDir, ep);

  for (const testCase of cases) {
    try {
      const actual = runEntrypoint(entryAbs, testCase.input, skillDir);
      if (testCase.expected !== undefined) {
        assert.deepStrictEqual(actual, testCase.expected);
      } else if (testCase.assert) {
        applyAssert(testCase.assert, actual);
      } else {
        throw new Error("Test case must include expected or assert");
      }
    } catch (err) {
      failures.push({
        testCase,
        error: err instanceof Error ? err.message : "Test failed"
      });
    }
  }

  const passed = cases.length - failures.length;
  return {
    ok: failures.length === 0,
    passed,
    failed: failures.length,
    failures
  };
}
