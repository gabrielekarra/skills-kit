import path from "node:path";

export function safeResolve(rootDir: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    throw new Error(`Absolute paths are not allowed: ${relativePath}`);
  }
  const normalized = relativePath.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  for (const seg of segments) {
    if (seg === "..") {
      throw new Error(`Path traversal not allowed: ${relativePath}`);
    }
  }
  const resolved = path.resolve(rootDir, relativePath);
  const rootResolved = path.resolve(rootDir);
  if (resolved !== rootResolved && !resolved.startsWith(rootResolved + path.sep)) {
    throw new Error(`Path escapes skill root: ${relativePath}`);
  }
  return resolved;
}

export function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

