import { runGoldenTests } from "@skills-kit/core";

export async function testCommand(dir: string) {
  return runGoldenTests(dir);
}

