import { lintSkill } from "@skills-kit/core";

export async function lintCommand(dir: string) {
  const res = await lintSkill(dir);
  return res;
}

