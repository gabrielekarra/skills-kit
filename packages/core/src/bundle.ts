import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { parseSkill } from "./skill.js";
import { safeResolve, toPosix } from "./utils/pathSafe.js";

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
  target: "claude" | "generic",
  outFile?: string
): Promise<string> {
  const parsed = await parseSkill(skillDir);
  const zip = new JSZip();
  const files = await collectFiles(skillDir);

  for (const rel of files) {
    const abs = safeResolve(skillDir, rel);
    const data = await fs.readFile(abs);
    zip.file(toPosix(rel), data);
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

