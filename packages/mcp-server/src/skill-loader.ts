import fs from "node:fs/promises";
import path from "node:path";
import { parseSkill, readPolicy, lintSkill } from "@skills-kit/core";
import { yamlToZodSchema } from "./schema-converter.js";
import type { LoadedSkill } from "./types.js";

/**
 * Check if a directory contains a valid skill (has SKILL.md)
 */
async function isSkillDirectory(dir: string): Promise<boolean> {
  try {
    const skillPath = path.join(dir, "SKILL.md");
    await fs.stat(skillPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load a single skill from a directory
 *
 * @param skillDir - Path to skill directory
 * @returns Loaded skill with parsed metadata, policy, and schema
 * @throws Error if skill is invalid or cannot be loaded
 */
export async function loadSkill(skillDir: string): Promise<LoadedSkill> {
  const resolvedDir = path.resolve(skillDir);

  // Parse skill
  const skill = await parseSkill(resolvedDir);

  // Load policy
  const policy = await readPolicy(resolvedDir);

  // Lint skill to catch issues early
  const lintResult = await lintSkill(resolvedDir);
  if (!lintResult.ok) {
    const errors = lintResult.issues.filter((i) => i.severity === "error");
    if (errors.length > 0) {
      throw new Error(
        `Skill "${skill.frontmatter.name}" has lint errors: ${errors.map((e) => e.message).join(", ")}`
      );
    }
  }

  // Convert inputs to Zod schema
  const schema = yamlToZodSchema(skill.frontmatter.inputs);

  return {
    skill,
    policy,
    schema
  };
}

/**
 * Discover and load all skills from a directory
 *
 * Searches for subdirectories containing SKILL.md files
 *
 * @param skillsDir - Directory containing skill subdirectories
 * @returns Array of loaded skills
 */
export async function loadSkillsFromDirectory(skillsDir: string): Promise<LoadedSkill[]> {
  const resolvedDir = path.resolve(skillsDir);

  // Check if the directory itself is a skill
  if (await isSkillDirectory(resolvedDir)) {
    return [await loadSkill(resolvedDir)];
  }

  // Otherwise, scan for skill subdirectories
  const entries = await fs.readdir(resolvedDir, { withFileTypes: true });
  const skillDirs: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subDir = path.join(resolvedDir, entry.name);
      if (await isSkillDirectory(subDir)) {
        skillDirs.push(subDir);
      }
    }
  }

  if (skillDirs.length === 0) {
    throw new Error(`No skills found in directory: ${skillsDir}`);
  }

  // Load all skills in parallel
  const results = await Promise.allSettled(skillDirs.map((dir) => loadSkill(dir)));

  const loaded: LoadedSkill[] = [];
  const errors: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      loaded.push(result.value);
    } else {
      errors.push(`Failed to load ${skillDirs[i]}: ${result.reason}`);
    }
  }

  // Log warnings for failed skills but don't fail entirely
  if (errors.length > 0) {
    console.warn(`Warning: Some skills failed to load:\n${errors.join("\n")}`);
  }

  if (loaded.length === 0) {
    throw new Error(`No valid skills could be loaded from: ${skillsDir}`);
  }

  return loaded;
}

/**
 * Load skills from an array of paths
 *
 * @param skillPaths - Array of paths to skill directories
 * @returns Array of loaded skills
 */
export async function loadSkillsFromPaths(skillPaths: string[]): Promise<LoadedSkill[]> {
  const results = await Promise.allSettled(skillPaths.map((p) => loadSkill(p)));

  const loaded: LoadedSkill[] = [];
  const errors: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      loaded.push(result.value);
    } else {
      errors.push(`Failed to load ${skillPaths[i]}: ${result.reason}`);
    }
  }

  if (errors.length > 0) {
    console.warn(`Warning: Some skills failed to load:\n${errors.join("\n")}`);
  }

  if (loaded.length === 0) {
    throw new Error("No valid skills could be loaded from provided paths");
  }

  return loaded;
}
