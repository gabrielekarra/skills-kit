import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initSkill } from "../src/commands/init.js";
import { lintCommand } from "../src/commands/lint.js";
import { testCommand } from "../src/commands/test.js";
import { createCommand } from "../src/commands/create.js";
import { parseSkill } from "@skills-kit/core";
import type { SkillSpec } from "@skills-kit/agent";

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
  it("creates a skill with anthropic provider that lints and tests", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "skills-kit-cli-"));
    const dir = path.join(tmp, "gen");

    // Mock Anthropic API responses
    const originalFetch = globalThis.fetch;
    const specResponse = {
      name: "demo-skill",
      description: "demo",
      version: "0.1.0",
      authors: ["skills-kit"],
      allowed_tools: [],
      entrypoints: ["scripts/run.cjs"],
      inputs: {},
      outputs: {},
      policy: {
        network: false,
        fs_read: [],
        fs_write: [],
        exec_allowlist: [],
        domains_allowlist: []
      },
      tests: { golden: [{ name: "ok", input: {}, expected: { ok: true } }] }
    } satisfies SkillSpec;

    const filesResponse = [
      { path: "SKILL.md", content: "---\nname: demo-skill\ndescription: demo\nversion: 0.1.0\nauthors:\n  - skills-kit\nallowed_tools: []\nentrypoints:\n  - scripts/run.cjs\ninputs: {}\noutputs: {}\n---\n\n# Demo Skill" },
      { path: "policy.yaml", content: "network: false\nfs_read: []\nfs_write: []\nexec_allowlist: []\ndomains_allowlist: []" },
      { path: "scripts/run.cjs", content: "#!/usr/bin/env node\nconst input = JSON.parse(require('fs').readFileSync(0, 'utf-8'));\nconsole.log(JSON.stringify({ ok: true }));" },
      { path: "tests/golden.json", content: JSON.stringify([{ name: "ok", input: {}, expected: { ok: true } }]) }
    ];

    let callCount = 0;
    globalThis.fetch = (() => {
      callCount++;
      const response = callCount === 1 ? specResponse : filesResponse;
      return Promise.resolve(
        new Response(JSON.stringify({ content: [{ text: JSON.stringify(response) }] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );
    }) as typeof fetch;

    // Set API key for test
    const prevKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key";

    try {
      const created = await createCommand("demo skill", dir, undefined);
      expect(created.ok).toBe(true);
      const parsed = await parseSkill(dir);
      expect(parsed.frontmatter.entrypoints?.[0]).toBe("scripts/run.cjs");
      const lintRes = await lintCommand(dir);
      expect(lintRes.ok).toBe(true);
      const testRes = await testCommand(dir);
      expect(testRes.ok).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
      if (prevKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prevKey;
    }
  });
});
