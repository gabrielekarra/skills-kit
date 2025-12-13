import path from "node:path";
import type { Policy } from "@skills-kit/core";
import type { PolicyViolation } from "./types.js";

/**
 * Validates that a resolved path is within the workspace.
 * Returns true if safe, false if path traversal detected.
 */
export function isPathSafe(targetPath: string, workspace: string): boolean {
  const resolved = path.resolve(targetPath);
  const workspaceResolved = path.resolve(workspace);
  return resolved.startsWith(workspaceResolved + path.sep) || resolved === workspaceResolved;
}

/**
 * Check policy compliance before running a skill.
 * Returns violations if any, empty array if OK.
 *
 * Note: This is a "best effort" implementation. True sandboxing requires:
 * - OS-level isolation (containers, VMs, seccomp, namespaces)
 * - Network filtering (iptables, proxy, DNS blocking)
 * - FS interception (FUSE, LD_PRELOAD, ptrace)
 * - For enterprise use, consider:
 *   - Docker/Podman containers with network=none
 *   - Firecracker microVMs
 *   - gVisor or Kata Containers
 */
export function checkPolicyCompliance(
  policy: Policy,
  workspace: string
): PolicyViolation[] {
  const violations: PolicyViolation[] = [];

  // Validate fs_read paths
  for (const p of policy.fs_read) {
    if (p !== "workspace" && p !== "none") {
      if (!isPathSafe(path.resolve(workspace, p), workspace)) {
        violations.push({
          code: "FS_READ_PATH_TRAVERSAL",
          message: `fs_read path "${p}" escapes workspace`
        });
      }
    }
  }

  // Validate fs_write paths
  for (const p of policy.fs_write) {
    if (p !== "workspace" && p !== "none") {
      if (!isPathSafe(path.resolve(workspace, p), workspace)) {
        violations.push({
          code: "FS_WRITE_PATH_TRAVERSAL",
          message: `fs_write path "${p}" escapes workspace`
        });
      }
    }
  }

  return violations;
}

/**
 * Best-effort policy enforcement documentation:
 *
 * IMPLEMENTED:
 * - Path traversal validation (prevents ../../../etc/passwd)
 * - Policy validation at runtime
 *
 * NOT IMPLEMENTED (requires OS-level sandboxing):
 * - Network blocking: Cannot truly block network without OS-level firewall.
 *   Recommendation: Run skills in Docker with --network=none.
 * - FS restrictions: Cannot intercept fs calls without kernel hooks.
 *   Recommendation: Use read-only volumes + allowlist mounts.
 * - Exec allowlist: Cannot prevent arbitrary exec without ptrace/seccomp.
 *   Recommendation: Use container without shell binaries.
 *
 * For production deployments, use containerized execution with:
 * - Docker/Podman: --network=none, --read-only, --cap-drop=ALL
 * - Firecracker: Full VM isolation
 * - gVisor: Application kernel for syscall filtering
 */
export const SECURITY_NOTES = `
Skills-kit runner provides best-effort policy enforcement:

✓ Path traversal protection (implemented)
✓ Policy validation (implemented)

⚠ Network isolation (requires OS-level sandbox)
⚠ Filesystem restrictions (requires OS-level sandbox)
⚠ Exec allowlist (requires OS-level sandbox)

For production use, run skills in isolated containers:
  docker run --rm --network=none --read-only --cap-drop=ALL \\
    -v \${SKILL_DIR}:/skill:ro node skills-kit run /skill
`;
