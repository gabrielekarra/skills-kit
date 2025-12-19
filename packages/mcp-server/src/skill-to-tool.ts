import { spawn } from "node:child_process";
import { safeResolve } from "@skills-kit/core";
import type { LoadedSkill } from "./types.js";
import { SkillExecutionError } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getInputSchema(loadedSkill: LoadedSkill): Record<string, unknown> & { type: "object" } {
  const raw = loadedSkill.skill.frontmatter.inputs;
  const schema = isRecord(raw) ? { ...raw } : {};
  if (schema["type"] !== "object") {
    schema["type"] = "object";
  }
  if (!Object.prototype.hasOwnProperty.call(schema, "additionalProperties")) {
    schema["additionalProperties"] = true;
  }
  return schema as Record<string, unknown> & { type: "object" };
}

/**
 * Execute a skill with given input
 *
 * @param loadedSkill - The loaded skill to execute
 * @param input - Input parameters for the skill
 * @param timeout - Timeout in milliseconds (default: 30000)
 * @returns Promise resolving to skill output
 */
export async function executeSkill(
  loadedSkill: LoadedSkill,
  input: unknown,
  timeout: number = 30000
): Promise<unknown> {
  const { skill } = loadedSkill;
  const entrypoint = skill.frontmatter.entrypoints?.[0];

  if (!entrypoint) {
    throw new SkillExecutionError(skill.frontmatter.name, new Error("No entrypoint defined"));
  }

  const entryAbs = safeResolve(skill.dir, entrypoint);
  const inputJson = JSON.stringify(input ?? {});

  console.error(`[executeSkill] Running ${skill.frontmatter.name}`);
  console.error(`[executeSkill] CWD: ${skill.dir}`);
  console.error(`[executeSkill] Input JSON length: ${inputJson.length} bytes`);

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entryAbs], {
      cwd: skill.dir,
      timeout
    });

    let stdout = "";
    let stderr = "";
    let timeoutId: NodeJS.Timeout | undefined;

    if (timeout) {
      timeoutId = setTimeout(() => {
        child.kill();
        reject(
          new SkillExecutionError(
            skill.frontmatter.name,
            new Error(`Skill execution timed out after ${timeout}ms`)
          )
        );
      }, timeout);
    }

    if (child.stdout) {
      child.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });
    }

    if (child.stderr) {
      child.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });
    }

    // Send input to stdin
    if (child.stdin) {
      child.stdin.write(inputJson);
      child.stdin.end();
    }

    child.on("error", (error: Error) => {
      if (timeoutId) clearTimeout(timeoutId);
      reject(
        new SkillExecutionError(skill.frontmatter.name, error, stdout, stderr)
      );
    });

    child.on("exit", (code: number | null) => {
      if (timeoutId) clearTimeout(timeoutId);

      if (code !== 0) {
        reject(
          new SkillExecutionError(
            skill.frontmatter.name,
            new Error(`Skill exited with code ${code}`),
            stdout,
            stderr,
            code ?? undefined
          )
        );
        return;
      }

      try {
        const trimmed = stdout.trim();
        if (!trimmed) {
          resolve(null);
          return;
        }
        const output: unknown = JSON.parse(trimmed);
        resolve(output);
      } catch (parseError) {
        const errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
        reject(
          new SkillExecutionError(
            skill.frontmatter.name,
            new Error(`Failed to parse skill output as JSON: ${errorMsg}`),
            stdout,
            stderr,
            code ?? undefined
          )
        );
      }
    });
  });
}

/**
 * Create MCP tool definition from a loaded skill
 *
 * @param loadedSkill - The loaded skill to convert
 * @param timeout - Execution timeout in milliseconds
 * @returns MCP tool definition object
 */
export function skillToToolDefinition(loadedSkill: LoadedSkill, timeout: number = 30000) {
  const { skill, policy, schema } = loadedSkill;
  const inputSchema = getInputSchema(loadedSkill);

  // Build description with policy information
  let description = skill.frontmatter.description;

  if (!policy.network) {
    description += " [Network: disabled]";
  }

  if (policy.fs_read.length > 0 || policy.fs_write.length > 0) {
    description += ` [Filesystem access: ${policy.fs_read.length > 0 ? "read" : ""}${policy.fs_read.length > 0 && policy.fs_write.length > 0 ? "," : ""}${policy.fs_write.length > 0 ? "write" : ""}]`;
  }

  return {
    name: skill.frontmatter.name,
    description,
    inputSchema,
    parameters: schema,
    execute: async (input: unknown) => {
      try {
        // Log incoming input for debugging
        console.error(`[skill-to-tool] Executing ${skill.frontmatter.name} with input:`, JSON.stringify(input, null, 2).slice(0, 500));

        // Validate input against schema
        const validated = schema.parse(input);

        // Execute skill
        const result = await executeSkill(loadedSkill, validated, timeout);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        if (error instanceof SkillExecutionError) {
          // Return structured error response
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    error: {
                      message: error.message,
                      skillName: error.skillName,
                      stdout: error.stdout,
                      stderr: error.stderr,
                      exitCode: error.exitCode
                    }
                  },
                  null,
                  2
                )
              }
            ],
            isError: true
          };
        }

        throw error;
      }
    }
  };
}
