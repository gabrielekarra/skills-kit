import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { parseSkill } from "./skill.js";
import { readPolicy } from "./policy.js";
import { safeResolve, toPosix } from "./utils/pathSafe.js";
import { generateOpenAISystemPrompt, generateOpenAIToolDefinition, generateOpenAIUsageDoc } from "./adapters/openai.js";
import { generateGenericReadme } from "./adapters/generic.js";
import { generateClaudeNotes } from "./adapters/claude.js";
import { generateGeminiSystemInstruction, generateGeminiFunctionDeclaration, generateGeminiUsageDoc } from "./adapters/gemini.js";

async function collectFiles(dir: string, relBase = ""): Promise<string[]> {
  const abs = safeResolve(dir, relBase || ".");
  const entries = await fs.readdir(abs, { withFileTypes: true });
  const files: string[] = [];
  for (const ent of entries) {
    if (ent.name === "node_modules" || ent.name === "dist" || ent.name === ".git") continue;
    const rel = relBase ? path.join(relBase, ent.name) : ent.name;
    if (ent.isDirectory()) {
      files.push(...(await collectFiles(dir, rel)));
    } else if (ent.isFile()) {
      files.push(rel);
    }
  }
  return files;
}

export async function bundleSkill(
  skillDir: string,
  target: "claude" | "openai" | "gemini" | "generic",
  outFile?: string
): Promise<string> {
  const parsed = await parseSkill(skillDir);
  const policy = await readPolicy(skillDir);
  const zip = new JSZip();
  const files = await collectFiles(skillDir);

  for (const rel of files) {
    const abs = safeResolve(skillDir, rel);
    const data = await fs.readFile(abs);
    zip.file(toPosix(rel), data);
  }

  // Add target-specific adapters
  if (target === "openai") {
    zip.file("adapters/openai/system_prompt.txt", generateOpenAISystemPrompt(parsed));
    zip.file("adapters/openai/tool.json", JSON.stringify(generateOpenAIToolDefinition(parsed), null, 2));
    zip.file("adapters/openai/usage.md", generateOpenAIUsageDoc(parsed, policy));
  } else if (target === "gemini") {
    zip.file("adapters/gemini/system_instruction.txt", generateGeminiSystemInstruction(parsed));
    zip.file("adapters/gemini/function.json", JSON.stringify(generateGeminiFunctionDeclaration(parsed), null, 2));
    zip.file("adapters/gemini/usage.md", generateGeminiUsageDoc(parsed, policy));
  } else if (target === "generic") {
    zip.file("README.md", generateGenericReadme(parsed, policy));
  } else if (target === "claude") {
    zip.file("adapters/claude/notes.md", generateClaudeNotes(parsed));
  }

  const manifest = {
    name: parsed.frontmatter.name,
    version: parsed.frontmatter.version,
    target,
    files: files.map(toPosix)
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const outPath = outFile ?? path.join(skillDir, `${parsed.frontmatter.name}-${target}.zip`);
  await fs.writeFile(outPath, buffer);
  return outPath;
}

