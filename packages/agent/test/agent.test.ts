import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSkill, MockProvider } from "../src/index.js";
import type { LLMProvider, LLMResponse, ProviderContext, SkillSpec } from "../src/providers/types.js";
import type { LintResult, TestResult } from "@skills-kit/core";

describe("agent create with mock provider", () => {
  it("creates a lintable skill", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "skills-kit-agent-"));
    const res = await createSkill("demo skill", dir, { provider: new MockProvider() });
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
