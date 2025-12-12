import { AnthropicProvider, MockProvider, refineSkill } from "@skills-kit/agent";
import path from "node:path";

function assertNoTraversal(p: string) {
  const norm = p.replace(/\\/g, "/").split("/").filter(Boolean);
  if (norm.some((s) => s === "..")) throw new Error("Path traversal not allowed");
}

export async function refineCommand(
  dir: string,
  change: string,
  model?: string,
  providerName: "mock" | "anthropic" = "mock"
) {
  if (!path.isAbsolute(dir)) assertNoTraversal(dir);
  const useAnthropic =
    providerName === "anthropic" &&
    Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.length > 0);
  const provider = useAnthropic ? new AnthropicProvider() : new MockProvider();
  return refineSkill(dir, change, { provider, model });
}
