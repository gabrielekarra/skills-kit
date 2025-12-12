import { AnthropicProvider, MockProvider, createSkill } from "@skills-kit/agent";
import path from "node:path";

function assertNoTraversal(p: string) {
  const norm = p.replace(/\\/g, "/").split("/").filter(Boolean);
  if (norm.some((s) => s === "..")) throw new Error("Path traversal not allowed");
}

export async function createCommand(
  description: string,
  outDir: string,
  model?: string,
  providerName: "mock" | "anthropic" = "mock"
) {
  if (!path.isAbsolute(outDir)) assertNoTraversal(outDir);
  const useAnthropic =
    providerName === "anthropic" &&
    Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.length > 0);
  const provider = useAnthropic ? new AnthropicProvider() : new MockProvider();
  return createSkill(description, outDir, { provider, model });
}
