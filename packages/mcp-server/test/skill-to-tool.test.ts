import { describe, it, expect } from "vitest";
import path from "node:path";
import { loadSkill } from "../src/skill-loader.js";
import { executeSkill, skillToToolDefinition } from "../src/skill-to-tool.js";

const TEST_SKILL_DIR = path.join(__dirname, "fixtures", "test-skill");

describe("executeSkill", () => {
  it("executes skill successfully with valid input", async () => {
    const loaded = await loadSkill(TEST_SKILL_DIR);

    const result = await executeSkill(loaded, {
      message: "hello",
      count: 1,
      uppercase: false
    });

    expect(result).toEqual({
      result: "hello",
      repeated: 1
    });
  });

  it("executes skill with default values", async () => {
    const loaded = await loadSkill(TEST_SKILL_DIR);

    const result = await executeSkill(loaded, {
      message: "test"
    });

    expect(result).toEqual({
      result: "test",
      repeated: 1
    });
  });

  it("executes skill with uppercase option", async () => {
    const loaded = await loadSkill(TEST_SKILL_DIR);

    const result = await executeSkill(loaded, {
      message: "hello",
      uppercase: true
    });

    expect(result).toEqual({
      result: "HELLO",
      repeated: 1
    });
  });

  it("executes skill with count", async () => {
    const loaded = await loadSkill(TEST_SKILL_DIR);

    const result = await executeSkill(loaded, {
      message: "test",
      count: 3
    });

    expect(result).toEqual({
      result: "test test test",
      repeated: 3
    });
  });
});

describe("skillToToolDefinition", () => {
  it("creates valid tool definition", async () => {
    const loaded = await loadSkill(TEST_SKILL_DIR);
    const toolDef = skillToToolDefinition(loaded);

    expect(toolDef.name).toBe("test-echo");
    expect(toolDef.description).toContain("echo skill");
    expect(toolDef.description).toContain("[Network: disabled]");
    expect(toolDef.parameters).toBeDefined();
    expect(typeof toolDef.execute).toBe("function");
  });

  it("tool execute function works", async () => {
    const loaded = await loadSkill(TEST_SKILL_DIR);
    const toolDef = skillToToolDefinition(loaded);

    const result = await toolDef.execute({
      message: "hello",
      count: 2
    });

    expect(result).toHaveProperty("content");
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]).toHaveProperty("type", "text");
    expect(result.content[0].text).toContain("hello hello");
  });

  it("tool execute function handles validation errors", async () => {
    const loaded = await loadSkill(TEST_SKILL_DIR);
    const toolDef = skillToToolDefinition(loaded);

    // Invalid input (message should be string, not number)
    await expect(
      toolDef.execute({
        message: 123
      })
    ).rejects.toThrow();
  });
});
