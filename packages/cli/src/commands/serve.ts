import { createSkillsServer, loadSkillsFromDirectory, loadSkillsFromPaths } from "@skills-kit/mcp-server";
import path from "node:path";
import fs from "node:fs/promises";
import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(execCb);

function assertNoTraversal(p: string) {
  const norm = p.replace(/\\/g, "/").split("/").filter(Boolean);
  if (norm.some((s) => s === "..")) throw new Error("Path traversal not allowed");
}

export async function serveCommand(
  targetPaths: string | string[],
  options: {
    port?: number;
    transport?: "sse" | "stdio";
    basePath?: string;
    inspector?: boolean;
    watch?: boolean;
    timeout?: number;
    installDeps?: boolean;
  }
) {
  // Normalize to array
  const pathsArray = Array.isArray(targetPaths) ? targetPaths : [targetPaths];

  // Resolve all paths
  const resolvedPaths = pathsArray.map((targetPath) => {
    if (!path.isAbsolute(targetPath)) {
      assertNoTraversal(targetPath);
    }
    return path.isAbsolute(targetPath)
      ? targetPath
      : path.resolve(process.cwd(), targetPath);
  });

  const transport = options.transport ?? "sse";
  const log = (message: string) => {
    if (transport === "stdio") {
      console.error(message);
    } else {
      console.log(message);
    }
  };

  async function installDependenciesForSkill(skillDir: string) {
    const packageJsonPath = path.join(skillDir, "package.json");
    let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | null = null;

    try {
      const raw = await fs.readFile(packageJsonPath, "utf8");
      pkg = JSON.parse(raw) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    } catch {
      log(`Skipping dependency install (no package.json): ${skillDir}`);
      return;
    }

    const deps = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {})
    };

    log(`Installing dependencies in ${skillDir}...`);
    await execAsync("npm install --prefer-online", { cwd: skillDir, timeout: 300000 });

    if (Object.prototype.hasOwnProperty.call(deps, "playwright")) {
      log(`Installing Playwright browsers in ${skillDir}...`);
      await execAsync("npx playwright install chromium", { cwd: skillDir, timeout: 300000 });
    }
  }

  // Use skillsDir for single path, skills array for multiple
  const config = resolvedPaths.length === 1
    ? {
        name: "skills-kit-server",
        version: "0.1.0",
        skillsDir: resolvedPaths[0],
        port: options.port ?? 3000,
        transport,
        basePath: options.basePath ?? "",
        enableInspector: options.inspector ?? false,
        watchMode: options.watch ?? false,
        timeout: options.timeout ?? 30000
      }
    : {
        name: "skills-kit-server",
        version: "0.1.0",
        skills: resolvedPaths,
        port: options.port ?? 3000,
        transport,
        basePath: options.basePath ?? "",
        enableInspector: options.inspector ?? false,
        watchMode: options.watch ?? false,
        timeout: options.timeout ?? 30000
      };

  try {
    if (options.installDeps) {
      const loaded = resolvedPaths.length === 1
        ? await loadSkillsFromDirectory(resolvedPaths[0])
        : await loadSkillsFromPaths(resolvedPaths);
      const uniqueDirs = Array.from(new Set(loaded.map((s) => s.skill.dir)));
      for (const dir of uniqueDirs) {
        await installDependenciesForSkill(dir);
      }
    }

    const server = await createSkillsServer(config);

    // Handle graceful shutdown
    const shutdown = async () => {
      // Use stderr to avoid interfering with stdio transport
      console.error("\nShutting down server...");
      await server.stop();
      process.exit(0);
    };

    process.on("SIGINT", () => {
      void shutdown();
    });
    process.on("SIGTERM", () => {
      void shutdown();
    });

    // Keep process alive
    if (config.transport === "sse") {
      await new Promise(() => {}); // Never resolves - keeps server running
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to start server: ${message}`);
  }
}
