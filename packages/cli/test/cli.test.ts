import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initSkill } from "../src/commands/init.js";
import { lintCommand } from "../src/commands/lint.js";
import { testCommand } from "../src/commands/test.js";
import { createCommand } from "../src/commands/create.js";
import { parseSkill } from "@skills-kit/core";

describe("cli init", () => {
  it("creates skeleton that lints", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "skills-kit-cli-"));
    const dir = path.join(tmp, "demo");
    await initSkill(dir);
    const res = await lintCommand(dir);
    expect(res.ok).toBe(true);
  });
});

describe("cli create", () => {
  it("creates a skill with mock provider that lints and tests", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "skills-kit-cli-"));
    const dir = path.join(tmp, "gen");
    const created = await createCommand("demo skill", dir, undefined, "mock");
    expect(created.ok).toBe(true);
    const parsed = await parseSkill(dir);
    expect(parsed.frontmatter.entrypoints?.[0]).toBe("scripts/run.cjs");
    const lintRes = await lintCommand(dir);
    expect(lintRes.ok).toBe(true);
    const testRes = await testCommand(dir);
    expect(testRes.ok).toBe(true);
  });
});
