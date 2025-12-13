import type { LLMProvider, LLMResponse, ProviderContext } from "./types.js";

function slugify(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "generated-skill";
}

export class MockProvider implements LLMProvider {
  name = "local";

  generateSkill(description: string, _context: ProviderContext): Promise<LLMResponse> {
    const lc = description.toLowerCase();

    const isPlaywright =
      /(playwright|smoke|smoketest|screenshot|login|dashboard|test\s+fumo|schermat)/i.test(lc);
    const isPrReviewer = /(pull\s*request|\bpr\b|review|revisione|diff|patch)/i.test(lc);

    if (isPlaywright) return Promise.resolve({ writes: playwrightSmoketestWrites(description) });
    if (isPrReviewer) return Promise.resolve({ writes: repoPrReviewerWrites(description) });

    const name = slugify(description);
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

This skill provides basic functionality. Extend scripts and tests as needed for your use case.
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
      message: `Local template provider cannot repair automatically. Use --provider=anthropic for AI-powered repair. Errors: ${errors.join("; ")}`
    });
  }
}

function playwrightSmoketestWrites(description: string) {
  return [
    {
      path: "SKILL.md",
      content: `---
name: playwright-smoketest
description: ${description}
version: 0.1.0
authors: ["skills-kit"]
allowed_tools: []
entrypoints:
  - scripts/run.cjs
inputs:
  type: object
  properties:
    url: { type: string }
    username: { type: string }
    password: { type: string }
outputs:
  type: object
  properties:
    ok: { type: boolean }
    steps: { type: array }
    screenshotPath: { type: string }
---

Playwright login smoketest simulation. Demonstrates skill structure with deterministic testing.
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
let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  let data = {};
  try { data = JSON.parse(input || "{}"); } catch {}
  const steps = [
    { action: "goto", url: data.url ?? "about:blank" },
    { action: "fill", selector: "#username", value: data.username ?? "" },
    { action: "fill", selector: "#password", value: "***" },
    { action: "click", selector: "button[type=submit]" },
    { action: "assert", selector: "#dashboard" }
  ];
  const ok = Boolean(data.url && data.username && data.password);
  const screenshotPath = ok ? "" : "resources/failure.png";
  process.stdout.write(
    JSON.stringify({ ok, steps, screenshotPath, errors: ok ? [] : ["missing credentials"] })
  );
});
`
    },
    {
      path: "tests/golden.json",
      content: JSON.stringify(
        [
          {
            name: "happy-path",
            input: { url: "https://example.com", username: "u", password: "p" },
            expected: {
              ok: true,
              steps: [
                { action: "goto", url: "https://example.com" },
                { action: "fill", selector: "#username", value: "u" },
                { action: "fill", selector: "#password", value: "***" },
                { action: "click", selector: "button[type=submit]" },
                { action: "assert", selector: "#dashboard" }
              ],
              screenshotPath: "",
              errors: []
            }
          }
        ],
        null,
        2
      )
    }
  ];
}

function repoPrReviewerWrites(description: string) {
  return [
    {
      path: "SKILL.md",
      content: `---
name: repo-pr-reviewer
description: ${description}
version: 0.1.0
authors: ["skills-kit"]
allowed_tools: []
entrypoints:
  - scripts/run.cjs
inputs:
  type: object
  properties:
    diff: { type: string }
outputs:
  type: object
  properties:
    risks: { type: array }
    suggestions: { type: array }
    summary: { type: string }
---

PR reviewer with pattern-based risk detection. Deterministic and portable.
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
let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  let data = {};
  try { data = JSON.parse(input || "{}"); } catch {}
  const diff = String(data.diff || "");
  const risks = [];
  const suggestions = [];

  if (/eval\\(/.test(diff)) risks.push({ level: "high", reason: "eval() usage" });
  if (/console\\.log/.test(diff)) risks.push({ level: "low", reason: "debug logging" });
  if (/TODO/.test(diff)) suggestions.push("Resolve TODOs before merge.");
  if (/any\\b/.test(diff)) suggestions.push("Consider stronger typing than any.");

  const summary = risks.length ? \`Found \${risks.length} risk(s).\` : "No obvious risks found.";
  process.stdout.write(JSON.stringify({ risks, suggestions, summary }));
});
`
    },
    {
      path: "tests/golden.json",
      content: JSON.stringify(
        [
          {
            name: "flags-eval",
            input: { diff: "+ const x = eval(userInput)\\n+ console.log(x)\\n" },
            expected: {
              risks: [
                { level: "high", reason: "eval() usage" },
                { level: "low", reason: "debug logging" }
              ],
              suggestions: [],
              summary: "Found 2 risk(s)."
            }
          }
        ],
        null,
        2
      )
    }
  ];
}
