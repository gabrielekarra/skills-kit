import { AnthropicProvider, OpenAIProvider, createSkill } from "@skills-kit/agent";
import type { ContextAttachment, LLMProvider } from "@skills-kit/agent";
import { createFileInput, safeResolve } from "@skills-kit/core";
import path from "node:path";
import fs from "node:fs/promises";
// @ts-expect-error pdf-parse has no types
import pdfParse from "pdf-parse";

export type ProviderType = "anthropic" | "openai";

function assertNoTraversal(p: string) {
  const norm = p.replace(/\\/g, "/").split("/").filter(Boolean);
  if (norm.some((s) => s === "..")) throw new Error("Path traversal not allowed");
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".json": "application/json",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

interface LoadContextOptions {
  textOnly?: boolean;
  filenameMap?: Map<string, string>;
}

function sanitizeResourceFilename(filename: string): string {
  const base = path.basename(filename);
  if (!base || base === "." || base === "..") {
    return "context-file";
  }
  return base;
}

function addSuffixToFilename(filename: string, suffix: number): string {
  const ext = path.extname(filename);
  const stem = path.basename(filename, ext);
  return `${stem}-${suffix}${ext}`;
}

function buildFilenameMap(contextPaths: string[]): Map<string, string> {
  const used = new Set<string>();
  const map = new Map<string, string>();

  for (const filePath of contextPaths) {
    const resolvedPath = path.resolve(filePath);
    const base = sanitizeResourceFilename(resolvedPath);
    let candidate = base;
    let counter = 1;

    while (used.has(candidate)) {
      candidate = addSuffixToFilename(base, counter);
      counter += 1;
    }

    used.add(candidate);
    map.set(resolvedPath, candidate);
  }

  return map;
}

async function copyContextFiles(
  contextPaths: string[],
  outDir: string,
  filenameMap: Map<string, string>
): Promise<void> {
  const resourcesDir = safeResolve(outDir, "resources");
  await fs.mkdir(resourcesDir, { recursive: true });

  for (const filePath of contextPaths) {
    const resolvedPath = path.resolve(filePath);
    const filename = filenameMap.get(resolvedPath) ?? sanitizeResourceFilename(resolvedPath);
    const destPath = safeResolve(outDir, path.join("resources", filename));
    await fs.copyFile(resolvedPath, destPath);
  }
}

function replaceExtension(filename: string, newExt: string): string {
  const ext = path.extname(filename);
  const stem = path.basename(filename, ext);
  return `${stem}${newExt}`;
}

async function extractPdfText(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  const parsed = await (pdfParse as (input: Buffer) => Promise<unknown>)(buffer);
  if (parsed && typeof parsed === "object" && "text" in parsed && typeof parsed.text === "string") {
    return parsed.text;
  }
  return "";
}

async function loadContextFiles(contextPaths: string[], options?: LoadContextOptions): Promise<ContextAttachment[]> {
  const attachments: ContextAttachment[] = [];
  const textOnly = options?.textOnly ?? false;
  const filenameMap = options?.filenameMap;

  for (const filePath of contextPaths) {
    const resolvedPath = path.resolve(filePath);
    const stats = await fs.stat(resolvedPath);
    if (!stats.isFile()) {
      throw new Error(`Context path is not a file: ${filePath}`);
    }

    const savedFilename = filenameMap?.get(resolvedPath) ?? sanitizeResourceFilename(resolvedPath);
    const mimeType = getMimeType(resolvedPath);

    // For PDFs with textOnly option, extract text instead of sending full binary
    if (textOnly && mimeType === "application/pdf") {
      const text = await extractPdfText(resolvedPath);
      const textFilename = replaceExtension(savedFilename, ".txt");
      attachments.push({
        filename: textFilename,
        mimeType: "text/plain",
        data: Buffer.from(text).toString("base64")
      });
      continue;
    }

    const fileInput = await createFileInput(resolvedPath, {
      mimeType,
      compression: "none" // Don't compress for API - base64 only
    });

    if (!fileInput.data) {
      throw new Error(`Failed to read context file: ${filePath}`);
    }

    attachments.push({
      filename: savedFilename,
      mimeType: fileInput.mimeType,
      data: fileInput.data
    });
  }

  return attachments;
}

function createProvider(providerType: ProviderType): LLMProvider {
  switch (providerType) {
    case "openai":
      return new OpenAIProvider();
    case "anthropic":
    default:
      return new AnthropicProvider();
  }
}

export function validateApiKey(providerType: ProviderType): { valid: boolean; message?: string } {
  if (providerType === "openai") {
    if (!process.env.OPENAI_API_KEY) {
      return {
        valid: false,
        message: `OPENAI_API_KEY environment variable is not set.

To use OpenAI as the provider, you need an OpenAI API key:
1. Get your API key from https://platform.openai.com/api-keys
2. Set it: export OPENAI_API_KEY=sk-...
3. Run the command again`
      };
    }
  } else {
    if (!process.env.ANTHROPIC_API_KEY) {
      return {
        valid: false,
        message: `ANTHROPIC_API_KEY environment variable is not set.

To use Anthropic as the provider, you need an Anthropic API key:
1. Get your API key from https://console.anthropic.com/
2. Set it: export ANTHROPIC_API_KEY=sk-ant-...
3. Run the command again`
      };
    }
  }
  return { valid: true };
}

export interface CreateCommandOptions {
  model?: string;
  contextFiles?: string[];
  providerType?: ProviderType;
  textOnly?: boolean;
}

export async function createCommand(
  description: string,
  outDir: string,
  options: CreateCommandOptions = {}
) {
  const {
    model,
    contextFiles,
    providerType = "anthropic",
    textOnly = false
  } = options;

  if (!path.isAbsolute(outDir)) assertNoTraversal(outDir);
  const provider = createProvider(providerType);
  const resolvedOutDir = path.isAbsolute(outDir) ? outDir : path.resolve(process.cwd(), outDir);

  let attachments: ContextAttachment[] | undefined;
  if (contextFiles && contextFiles.length > 0) {
    const filenameMap = buildFilenameMap(contextFiles);
    await copyContextFiles(contextFiles, resolvedOutDir, filenameMap);
    attachments = await loadContextFiles(contextFiles, { textOnly, filenameMap });
  }

  return createSkill(description, outDir, { provider, model, attachments });
}
