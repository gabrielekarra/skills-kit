import fs from "node:fs/promises";
import { runSkill, type RunResult } from "@skills-kit/runner";

export async function runCommand(
  dir: string,
  options: { input?: string; json?: string }
): Promise<RunResult> {
  let inputData: unknown = {};

  // Load input from file or inline JSON
  if (options.input) {
    const text = await fs.readFile(options.input, "utf8");
    inputData = JSON.parse(text) as unknown;
  } else if (options.json) {
    inputData = JSON.parse(options.json) as unknown;
  }

  const result = await runSkill(dir, { input: inputData });
  return result;
}
