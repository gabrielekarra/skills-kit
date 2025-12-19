import fs from "node:fs/promises";
import path from "node:path";

function assertNoTraversal(p: string) {
  const norm = p.replace(/\\/g, "/").split("/").filter(Boolean);
  if (norm.some((s) => s === "..")) throw new Error("Path traversal not allowed");
}

export async function initSkill(dir: string) {
  assertNoTraversal(dir);
  const root = path.resolve(process.cwd(), dir);
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(path.join(root, "scripts"), { recursive: true });
  await fs.mkdir(path.join(root, "resources"), { recursive: true });

  const name = path.basename(root);
  const skillMd = `---
name: ${name}
description: Describe your skill.
version: 0.1.0
authors: ["you"]
allowed_tools: []
entrypoints:
  - scripts/run.cjs
inputs: {}
outputs: {}
---

What this skill does, how to use it, and examples.
`;
  await fs.writeFile(path.join(root, "SKILL.md"), skillMd, "utf8");
  await fs.writeFile(
    path.join(root, "policy.yaml"),
    `network: false
fs_read: []
fs_write: []
exec_allowlist: []
domains_allowlist: []
`,
    "utf8"
  );
  await fs.writeFile(
    path.join(root, "scripts", "run.cjs"),
    `#!/usr/bin/env node
let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  let data = {};
  try { data = JSON.parse(input || "{}"); } catch {}
  process.stdout.write(JSON.stringify({ ok: true, echo: data }));
});
`,
    "utf8"
  );
  return root;
}
