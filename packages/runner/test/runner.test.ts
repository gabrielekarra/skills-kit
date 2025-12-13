import { describe, it, expect } from "vitest";
import { isPathSafe } from "../src/sandbox.js";

describe("runner sandbox", () => {
  it("detects path traversal", () => {
    const workspace = "/home/user/skills/my-skill";
    expect(isPathSafe("/home/user/skills/my-skill/scripts/run.cjs", workspace)).toBe(true);
    expect(isPathSafe("/home/user/skills/my-skill", workspace)).toBe(true);
    expect(isPathSafe("/home/user/skills/other-skill", workspace)).toBe(false);
    expect(isPathSafe("/etc/passwd", workspace)).toBe(false);
  });
});
