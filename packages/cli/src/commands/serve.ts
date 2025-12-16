import { createSkillsServer } from "@skills-kit/mcp-server";
import path from "node:path";

function assertNoTraversal(p: string) {
  const norm = p.replace(/\\/g, "/").split("/").filter(Boolean);
  if (norm.some((s) => s === "..")) throw new Error("Path traversal not allowed");
}

export async function serveCommand(
  targetPath: string,
  options: {
    port?: number;
    transport?: "sse" | "stdio";
    basePath?: string;
    inspector?: boolean;
    watch?: boolean;
    timeout?: number;
  }
) {
  // Resolve path
  const resolvedPath = path.isAbsolute(targetPath)
    ? targetPath
    : path.resolve(process.cwd(), targetPath);

  if (!path.isAbsolute(targetPath)) {
    assertNoTraversal(targetPath);
  }

  // Determine if it's a directory with multiple skills or a single skill
  const config = {
    name: "skills-kit-server",
    version: "0.1.0",
    skillsDir: resolvedPath,
    port: options.port ?? 3000,
    transport: options.transport ?? "sse",
    basePath: options.basePath ?? "",
    enableInspector: options.inspector ?? false,
    watchMode: options.watch ?? false,
    timeout: options.timeout ?? 30000
  };

  try {
    const server = await createSkillsServer(config);

    // Handle graceful shutdown
    const shutdown = async () => {
      console.log("\nShutting down server...");
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
