import { AnthropicProvider, refineSkill } from "@skills-kit/agent";
import path from "node:path";

function assertNoTraversal(p: string) {
  const norm = p.replace(/\\/g, "/").split("/").filter(Boolean);
  if (norm.some((s) => s === "..")) throw new Error("Path traversal not allowed");
}

export async function refineCommand(
  dir: string,
  change: string,
  model?: string
) {
  if (!path.isAbsolute(dir)) assertNoTraversal(dir);
  const provider = new AnthropicProvider();
  return refineSkill(dir, change, { provider, model });
}
