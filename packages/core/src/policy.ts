import fs from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import type { Policy } from "./types.js";
import { safeResolve } from "./utils/pathSafe.js";

const DEFAULT_POLICY: Policy = {
  network: false,
  fs_read: [],
  fs_write: [],
  exec_allowlist: [],
  domains_allowlist: []
};

function normalizePolicy(raw: unknown): Policy {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_POLICY };
  const obj = raw as Record<string, unknown>;
  return {
    network: Boolean(obj.network ?? false),
    fs_read: Array.isArray(obj.fs_read) ? obj.fs_read.map(String) : [],
    fs_write: Array.isArray(obj.fs_write) ? obj.fs_write.map(String) : [],
    exec_allowlist: Array.isArray(obj.exec_allowlist) ? obj.exec_allowlist.map(String) : [],
    domains_allowlist: Array.isArray(obj.domains_allowlist) ? obj.domains_allowlist.map(String) : []
  };
}

export async function readPolicy(skillDir: string): Promise<Policy> {
  const policyPath = safeResolve(skillDir, "policy.yaml");
  try {
    const yamlText = await fs.readFile(policyPath, "utf8");
    const raw: unknown = parseYaml(yamlText);
    return normalizePolicy(raw);
  } catch {
    return { ...DEFAULT_POLICY };
  }
}
