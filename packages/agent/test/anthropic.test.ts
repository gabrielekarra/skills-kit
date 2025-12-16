import { describe, it, expect } from "vitest";
import { AnthropicProvider } from "../src/providers/anthropic.js";
import type { SkillSpec } from "../src/providers/types.js";

function withEnv(key: string, value: string, fn: () => Promise<void>) {
  const prev = process.env[key];
  process.env[key] = value;
  return fn().finally(() => {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  });
}

describe("AnthropicProvider", () => {
  it("retries with stricter JSON prompt when spec is not JSON", async () => {
    const provider = new AnthropicProvider();
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const responses = [
      { content: [{ text: "not json" }] },
      {
        content: [
          {
            text: JSON.stringify({
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
            } satisfies SkillSpec)
          }
        ]
      }
    ];
    let idx = 0;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      const body = JSON.stringify(responses[Math.min(idx, responses.length - 1)]);
      idx += 1;
      return Promise.resolve(
        new Response(body, { status: 200, headers: { "content-type": "application/json" } })
      );
    }) as typeof fetch;

    try {
      await withEnv("ANTHROPIC_API_KEY", "test", async () => {
        const spec = await provider.generateSpec("demo", { model: "test-model" });
        expect(spec.name).toBe("demo-skill");
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(calls.length).toBe(2);
    const secondInit = calls[1]?.init;
    const body = typeof secondInit?.body === "string" ? secondInit.body : "";
    expect(body).toContain("JSON-only generator");
  });
});
