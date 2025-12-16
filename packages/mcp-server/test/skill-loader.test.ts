import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { loadSkill, loadSkillsFromDirectory } from "../src/skill-loader.js";

const FIXTURES_DIR = path.join(__dirname, "fixtures");
const TEST_SKILL_DIR = path.join(FIXTURES_DIR, "test-skill");

describe("loadSkill", () => {
  it("loads a valid skill", async () => {
    const loaded = await loadSkill(TEST_SKILL_DIR);

    expect(loaded.skill.frontmatter.name).toBe("test-echo");
    expect(loaded.skill.frontmatter.description).toContain("echo skill");
    expect(loaded.policy.network).toBe(false);
    expect(loaded.schema).toBeDefined();
  });

  it("throws for non-existent directory", async () => {
    await expect(loadSkill("/nonexistent/path")).rejects.toThrow();
  });

  it("parses input schema correctly", async () => {
    const loaded = await loadSkill(TEST_SKILL_DIR);

    // Test that schema can parse valid input
    const validInput = {
      message: "hello",
      count: 2,
      uppercase: true
    };

    expect(() => loaded.schema.parse(validInput)).not.toThrow();

    // Test that schema rejects invalid input
    expect(() => loaded.schema.parse({ message: 123 })).toThrow();
  });
});

describe("loadSkillsFromDirectory", () => {
  it("loads skill from directory containing single skill", async () => {
    const skills = await loadSkillsFromDirectory(TEST_SKILL_DIR);

    expect(skills).toHaveLength(1);
    expect(skills[0].skill.frontmatter.name).toBe("test-echo");
  });

  it("loads multiple skills from parent directory", async () => {
    const skills = await loadSkillsFromDirectory(FIXTURES_DIR);

    expect(skills.length).toBeGreaterThan(0);
    expect(skills[0].skill.frontmatter.name).toBe("test-echo");
  });

  it("throws for directory with no skills", async () => {
    const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), "empty-skills-"));
    await expect(loadSkillsFromDirectory(emptyDir)).rejects.toThrow("No skills found");
    await fs.rm(emptyDir, { recursive: true });
  });
});
