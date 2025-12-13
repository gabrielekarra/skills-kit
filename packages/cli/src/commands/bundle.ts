import { bundleSkill } from "@skills-kit/core";

export async function bundleCommand(dir: string, target: "claude" | "openai" | "gemini" | "generic") {
  return bundleSkill(dir, target);
}

