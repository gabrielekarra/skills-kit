import { spawn } from "node:child_process";
import path from "node:path";
import { parseSkill, readPolicy } from "@skills-kit/core";
import { checkPolicyCompliance } from "./sandbox.js";
import type { RunOptions, RunResult } from "./types.js";

export async function runSkill(
  skillDir: string,
  options: RunOptions = {}
): Promise<RunResult> {
  const workspace = path.resolve(skillDir);
  const parsed = await parseSkill(workspace);
  const policy = await readPolicy(workspace);

  // Check policy compliance
  const violations = checkPolicyCompliance(policy, workspace);
  if (violations.length > 0) {
    return {
      ok: false,
      error: `Policy violations: ${violations.map((v) => v.message).join("; ")}`
    };
  }

  // Get entrypoint
  const entrypoint = parsed.frontmatter.entrypoints?.[0];
  if (!entrypoint || typeof entrypoint !== "string") {
    return {
      ok: false,
      error: "No entrypoint defined in SKILL.md frontmatter"
    };
  }

  const entryAbs = path.resolve(workspace, entrypoint);

  // Validate path safety
  if (!entryAbs.startsWith(workspace + path.sep)) {
    return {
      ok: false,
      error: `Entrypoint path traversal detected: ${entrypoint}`
    };
  }

  // Prepare input
  const inputData = options.input ?? {};
  const inputJson = JSON.stringify(inputData);

  // Run entrypoint with timeout
  const timeout = options.timeout ?? 30000;
  const cwd = options.cwd ?? workspace;

  return new Promise<RunResult>((resolve) => {
    const proc = spawn(process.execPath, [entryAbs], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      timeout
    });

    let stdout = "";
    let stderr = "";
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      proc.kill("SIGTERM");
    }, timeout);

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        error: `Process error: ${err.message}`,
        logs: stderr
      });
    });

    proc.on("close", (code) => {
      clearTimeout(timer);

      if (killed) {
        resolve({
          ok: false,
          error: `Timeout after ${timeout}ms`,
          logs: stderr
        });
        return;
      }

      if (code !== 0) {
        resolve({
          ok: false,
          error: `Process exited with code ${code}`,
          logs: stderr
        });
        return;
      }

      // Parse output
      const trimmed = stdout.trim();
      if (!trimmed) {
        resolve({
          ok: true,
          output: null,
          logs: stderr
        });
        return;
      }

      try {
        const output: unknown = JSON.parse(trimmed);
        resolve({
          ok: true,
          output,
          logs: stderr
        });
      } catch (err) {
        resolve({
          ok: false,
          error: `Invalid JSON output: ${err instanceof Error ? err.message : "parse error"}`,
          logs: stderr
        });
      }
    });

    // Write input to stdin
    proc.stdin.write(inputJson);
    proc.stdin.end();
  });
}
