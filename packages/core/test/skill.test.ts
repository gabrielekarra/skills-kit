import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseSkill, lintSkill, safeResolve } from "../src/index.js";

async function mkTmpSkill(markdown: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "skills-kit-"));
  await fs.writeFile(path.join(dir, "SKILL.md"), markdown);
  await fs.writeFile(path.join(dir, "policy.yaml"), "network: false\n");
  await fs.mkdir(path.join(dir, "scripts"));
  await fs.writeFile(
    path.join(dir, "scripts", "run.cjs"),
    "console.log(JSON.stringify({ok:true}))\n"
  );
  await fs.mkdir(path.join(dir, "tests"));
  await fs.writeFile(path.join(dir, "tests", "golden.json"), "[]");
  return dir;
}

describe("parseSkill", () => {
  it("parses yaml frontmatter and body", async () => {
    const dir = await mkTmpSkill(`---
name: hello-skill
description: hi
version: 0.1.0
authors: ["me"]
allowed_tools: []
entrypoints: ["scripts/run.cjs"]
inputs: {}
outputs: {}
---
Body here
`);
    const parsed = await parseSkill(dir);
    expect(parsed.frontmatter.name).toBe("hello-skill");
    expect(parsed.body).toContain("Body here");
  });
});

describe("safeResolve", () => {
  it("blocks traversal", () => {
    expect(() => safeResolve("/tmp/x", "../evil")).toThrow();
  });
});

describe("lintSkill", () => {
  it("reports ok for valid skill", async () => {
    const dir = await mkTmpSkill(`---
name: hello-skill
description: hi
version: 0.1.0
authors: ["me"]
allowed_tools: []
entrypoints: ["scripts/run.cjs"]
inputs: {}
outputs: {}
---
`);
    const res = await lintSkill(dir);
    expect(res.ok).toBe(true);
  });
});
