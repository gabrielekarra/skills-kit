import fs from "node:fs/promises";
import path from "node:path";
import { safeResolve } from "@skills-kit/core";
import type { LLMWrite } from "./providers/types.js";

export async function applyWrites(skillDir: string, writes: LLMWrite[]) {
  for (const w of writes) {
    const abs = safeResolve(skillDir, w.path);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, w.content, "utf8");
  }
}

type HunkLine = { type: "context" | "add" | "del"; text: string };
type FilePatch = { filePath: string; hunks: { oldStart: number; lines: HunkLine[] }[] };

function parseUnifiedDiff(diffText: string): FilePatch[] {
  const lines = diffText.split(/\r?\n/);
  const patches: FilePatch[] = [];
  let i = 0;
  let current: FilePatch | null = null;

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("--- ")) {
      const next = lines[i + 1];
      if (!next?.startsWith("+++ ")) {
        i++;
        continue;
      }
      const filePath = next.replace("+++ ", "").replace(/^b\//, "").trim();
      current = { filePath, hunks: [] };
      patches.push(current);
      i += 2;
      continue;
    }
    if (line.startsWith("@@") && current) {
      const m = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      const oldStart = m ? Number(m[1]) : 1;
      const hunkLines: HunkLine[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("@@") && !lines[i].startsWith("--- ")) {
        const l = lines[i];
        if (l.startsWith("+")) hunkLines.push({ type: "add", text: l.slice(1) });
        else if (l.startsWith("-")) hunkLines.push({ type: "del", text: l.slice(1) });
        else if (l.startsWith(" ")) hunkLines.push({ type: "context", text: l.slice(1) });
        i++;
      }
      current.hunks.push({ oldStart, lines: hunkLines });
      continue;
    }
    i++;
  }

  return patches;
}

function applyHunks(original: string[], hunks: FilePatch["hunks"]): string[] {
  let out = [...original];
  let offset = 0;
  for (const h of hunks) {
    const idx = h.oldStart - 1 + offset;
    let cursor = idx;
    const before = out.slice(0, idx);
    const after: string[] = [];
    for (const ln of h.lines) {
      if (ln.type === "context") {
        if (out[cursor] !== ln.text) {
          throw new Error("Patch context mismatch");
        }
        after.push(out[cursor]);
        cursor++;
      } else if (ln.type === "del") {
        if (out[cursor] !== ln.text) {
          throw new Error("Patch delete mismatch");
        }
        cursor++;
        offset -= 1;
      } else if (ln.type === "add") {
        after.push(ln.text);
        offset += 1;
      }
    }
    const remaining = out.slice(cursor);
    out = [...before, ...after, ...remaining];
  }
  return out;
}

export async function applyUnifiedDiff(skillDir: string, diffText: string) {
  const patches = parseUnifiedDiff(diffText);
  for (const p of patches) {
    const abs = safeResolve(skillDir, p.filePath);
    let originalText = "";
    try {
      originalText = await fs.readFile(abs, "utf8");
    } catch {
      originalText = "";
    }
    const originalLines = originalText.split(/\r?\n/);
    const nextLines = applyHunks(originalLines, p.hunks);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, nextLines.join("\n"), "utf8");
  }
}

