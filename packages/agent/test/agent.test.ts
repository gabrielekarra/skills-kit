import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSkill } from "../src/index.js";
import type { LLMProvider, LLMResponse, ProviderContext, SkillSpec } from "../src/providers/types.js";
import type { LintResult, TestResult } from "@skills-kit/core";

class SimpleTestProvider implements LLMProvider {
  name = "test";

  generateSkill(description: string, _context: ProviderContext): Promise<LLMResponse> {
    const name = description
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "generated-skill";

    return Promise.resolve({
      writes: [
        {
          path: "SKILL.md",
          content: `---
name: ${name}
description: ${description}
version: 0.1.0
authors: ["skills-kit"]
allowed_tools: []
entrypoints:
  - scripts/run.cjs
inputs: {}
outputs: {}
---

This skill provides basic functionality.
`
        },
        {
          path: "policy.yaml",
          content: `network: false
fs_read: []
fs_write: []
exec_allowlist: []
domains_allowlist: []
`
        },
        {
          path: "scripts/run.cjs",
          content: `#!/usr/bin/env node
const fs = require("node:fs");

let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  let data = {};
  try { data = JSON.parse(input || "{}"); } catch {}
  const out = { ok: true, echo: data };
  process.stdout.write(JSON.stringify(out));
});
`
        },
        {
          path: "tests/golden.json",
          content: JSON.stringify(
            [
              {
                name: "echo",
                input: { hello: "world" },
                expected: { ok: true, echo: { hello: "world" } }
              }
            ],
            null,
            2
          )
        }
      ]
    });
  }

  repairSkill(_description: string, _context: ProviderContext, errors: string[]): Promise<LLMResponse> {
    return Promise.resolve({
      message: `Test provider cannot repair. Errors: ${errors.join("; ")}`
    });
  }
}

describe("agent create with test provider", () => {
  it("creates a lintable skill", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "skills-kit-agent-"));
    const res = await createSkill("demo skill", dir, { provider: new SimpleTestProvider() });
    expect(res.ok).toBe(true);
  });
});

describe("agent create with builder provider", () => {
  it("uses generateSpec + generateFilesFromSpec pipeline", async () => {
    class FakeBuilderProvider implements LLMProvider {
      name = "fake-builder";
      calls = { spec: 0, files: 0, repair: 0, legacyGenerate: 0, legacyRepair: 0 };

      generateSkill(_description: string, _context: ProviderContext): Promise<LLMResponse> {
        this.calls.legacyGenerate += 1;
        return Promise.reject(new Error("generateSkill should not be used"));
      }

      repairSkill(
        _description: string,
        _context: ProviderContext,
        _errors: string[]
      ): Promise<LLMResponse> {
        this.calls.legacyRepair += 1;
        return Promise.reject(new Error("repairSkill should not be used"));
      }

      generateSpec(_nlPrompt: string, _context: ProviderContext): Promise<SkillSpec> {
        this.calls.spec += 1;
        return Promise.resolve({
          name: "fake-skill",
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
          tests: {
            golden: [
              { name: "ok", input: {}, expected: { ok: true } }
            ]
          }
        });
      }

      generateFilesFromSpec(_spec: SkillSpec, _context: ProviderContext): Promise<LLMResponse> {
        this.calls.files += 1;
        return Promise.resolve({
          writes: [
            {
              path: "SKILL.md",
              content: `---
name: fake-skill
description: demo
version: 0.1.0
authors: ["skills-kit"]
allowed_tools: []
entrypoints:
  - scripts/run.cjs
inputs: {}
outputs: {}
---
`
            },
            {
              path: "policy.yaml",
              content: `network: false
fs_read: []
fs_write: []
exec_allowlist: []
domains_allowlist: []
`
            },
            {
              path: "scripts/run.cjs",
              content: `#!/usr/bin/env node
process.stdout.write(JSON.stringify({ ok: true }));
`
            },
            {
              path: "tests/golden.json",
              content: JSON.stringify([{ name: "ok", input: {}, expected: { ok: true } }], null, 2)
            }
          ]
        });
      }

      repairFromErrors(
        _nlPrompt: string,
        _context: ProviderContext,
        _lintOutput: LintResult,
        _testOutput: TestResult
      ): Promise<LLMResponse> {
        this.calls.repair += 1;
        return Promise.resolve({ writes: [] });
      }
    }

    const provider = new FakeBuilderProvider();
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "skills-kit-agent-builder-"));
    const res = await createSkill("demo builder", dir, { provider });
    expect(res.ok).toBe(true);
    expect(provider.calls.spec).toBe(1);
    expect(provider.calls.files).toBe(1);
    expect(provider.calls.legacyGenerate).toBe(0);
  });
});
