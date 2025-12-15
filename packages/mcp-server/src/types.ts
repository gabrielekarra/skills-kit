import type { ParsedSkill, Policy } from "@skills-kit/core";
import type { z } from "zod";

export type LoadedSkill = {
  skill: ParsedSkill;
  policy: Policy;
  schema: z.ZodObject<any>;
};

export type SkillsServerConfig = {
  name: string;
  version: string;

  // Skill loading options (one of these must be provided)
  skillsDir?: string;
  skills?: string[];

  // Server config
  port?: number;
  transport?: "sse" | "stdio";
  basePath?: string;

  // Optional features
  enableInspector?: boolean;
  watchMode?: boolean;
  timeout?: number;
};

export class SkillExecutionError extends Error {
  constructor(
    public skillName: string,
    public cause: Error,
    public stdout?: string,
    public stderr?: string,
    public exitCode?: number
  ) {
    super(`Skill "${skillName}" execution failed: ${cause.message}`);
    this.name = "SkillExecutionError";
  }
}
