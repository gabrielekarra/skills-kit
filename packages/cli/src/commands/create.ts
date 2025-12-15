import { AnthropicProvider, createSkill } from "@skills-kit/agent";
import path from "node:path";

function assertNoTraversal(p: string) {
  const norm = p.replace(/\\/g, "/").split("/").filter(Boolean);
  if (norm.some((s) => s === "..")) throw new Error("Path traversal not allowed");
}

export async function createCommand(
  description: string,
  outDir: string,
  model?: string
) {
  if (!path.isAbsolute(outDir)) assertNoTraversal(outDir);
  const provider = new AnthropicProvider();
  return createSkill(description, outDir, { provider, model });
}
