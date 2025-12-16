import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool
} from "@modelcontextprotocol/sdk/types.js";
import http from "node:http";
import { watch } from "chokidar";
import { loadSkillsFromDirectory, loadSkillsFromPaths } from "./skill-loader.js";
import { skillToToolDefinition } from "./skill-to-tool.js";
import type { SkillsServerConfig, LoadedSkill } from "./types.js";
import type { z } from "zod";

interface ToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodObject<z.ZodRawShape>;
  execute: (input: unknown) => Promise<{
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
  }>;
}

export class SkillsMCPServer {
  private server: Server;
  private loadedSkills: Map<string, LoadedSkill> = new Map();
  private tools: Map<string, ToolDefinition> = new Map();
  private config: Required<Omit<SkillsServerConfig, "skillsDir" | "skills">> & {
    skillsDir?: string;
    skills?: string[];
  };
  private httpServer?: http.Server;
  private watcher?: ReturnType<typeof watch>;

  constructor(config: SkillsServerConfig) {
    this.config = {
      name: config.name,
      version: config.version,
      port: config.port ?? 3000,
      transport: config.transport ?? "sse",
      basePath: config.basePath ?? "",
      enableInspector: config.enableInspector ?? false,
      watchMode: config.watchMode ?? false,
      timeout: config.timeout ?? 30000,
      skillsDir: config.skillsDir,
      skills: config.skills
    };

    // Create MCP server
    this.server = new Server(
      {
        name: this.config.name,
        version: this.config.version
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, () => {
      const tools: Tool[] = Array.from(this.tools.values()).map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: {
          type: "object",
          properties: tool.parameters.shape ?? {},
          required: Object.keys(tool.parameters.shape ?? {}).filter((key) => {
            const field = tool.parameters.shape?.[key];
            return field && !field.isOptional();
          })
        }
      }));

      return { tools };
    });

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params.name;
      const tool = this.tools.get(toolName);

      if (!tool) {
        throw new Error(`Tool not found: ${toolName}`);
      }

      try {
        const result = await tool.execute(request.params.arguments ?? {});
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Tool execution failed: ${message}`);
      }
    });
  }

  private async loadSkills() {
    console.log("Loading skills...");

    let skills: LoadedSkill[];

    if (this.config.skillsDir) {
      skills = await loadSkillsFromDirectory(this.config.skillsDir);
    } else if (this.config.skills && this.config.skills.length > 0) {
      skills = await loadSkillsFromPaths(this.config.skills);
    } else {
      throw new Error("Either skillsDir or skills array must be provided");
    }

    // Clear existing skills and tools
    this.loadedSkills.clear();
    this.tools.clear();

    // Register each skill as a tool
    for (const loadedSkill of skills) {
      const skillName = loadedSkill.skill.frontmatter.name;
      this.loadedSkills.set(skillName, loadedSkill);

      const toolDef = skillToToolDefinition(loadedSkill, this.config.timeout);
      this.tools.set(skillName, toolDef);

      console.log(`  ✓ Loaded skill: ${skillName}`);
    }

    console.log(`Loaded ${skills.length} skill(s)`);
  }

  private setupWatcher() {
    if (!this.config.watchMode) return;

    const pathsToWatch = this.config.skillsDir
      ? [this.config.skillsDir]
      : this.config.skills ?? [];

    this.watcher = watch(pathsToWatch, {
      persistent: true,
      ignoreInitial: true,
      depth: 3,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100
      }
    });

    this.watcher.on("change", (path) => {
      if (path.endsWith("SKILL.md") || path.endsWith("policy.yaml")) {
        console.log(`\nDetected change in ${path}, reloading skills...`);
        this.loadSkills()
          .then(() => {
            console.log("Skills reloaded successfully");
          })
          .catch((error: unknown) => {
            console.error("Failed to reload skills:", error);
          });
      }
    });

    console.log("Watch mode enabled - monitoring for changes");
  }

  async start() {
    // Load skills
    await this.loadSkills();

    if (this.config.transport === "stdio") {
      // STDIO transport (for Claude Desktop)
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.log("MCP server running on stdio");
    } else {
      // SSE transport (HTTP-based)
      this.httpServer = http.createServer((req, res) => {
        const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
        const basePath = this.config.basePath;

        // SSE endpoint
        if (url.pathname === `${basePath}/sse`) {
          console.log(`SSE connection from ${req.socket.remoteAddress}`);

          const transport = new SSEServerTransport(url.pathname, res);
          this.server.connect(transport).catch((error: unknown) => {
            console.error("Failed to connect SSE transport:", error);
          });
          return;
        }

        // Health check endpoint
        if (url.pathname === `${basePath}/health`) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              status: "ok",
              skills: Array.from(this.loadedSkills.keys()),
              version: this.config.version
            })
          );
          return;
        }

        // Inspector UI (if enabled)
        if (this.config.enableInspector && url.pathname === `${basePath}/inspector`) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(this.getInspectorHTML());
          return;
        }

        // 404
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
      });

      await new Promise<void>((resolve) => {
        this.httpServer!.listen(this.config.port, () => {
          resolve();
        });
      });

      const baseUrl = `http://localhost:${this.config.port}${this.config.basePath}`;
      console.log(`\nMCP server running at ${baseUrl}`);
      console.log(`SSE endpoint: ${baseUrl}/sse`);
      console.log(`Health check: ${baseUrl}/health`);

      if (this.config.enableInspector) {
        console.log(`Inspector: ${baseUrl}/inspector`);
      }
    }

    // Setup file watcher if enabled
    this.setupWatcher();
  }

  async stop() {
    if (this.watcher) {
      await this.watcher.close();
    }

    if (this.httpServer) {
      await new Promise<void>((resolve, reject) => {
        this.httpServer!.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    await this.server.close();
  }

  private getInspectorHTML(): string {
    const tools = Array.from(this.tools.values());
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Skills MCP Inspector</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    h1 { color: #333; }
    .skill {
      background: white;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .skill-name {
      font-size: 20px;
      font-weight: bold;
      color: #0066cc;
      margin-bottom: 10px;
    }
    .skill-description {
      color: #666;
      margin-bottom: 15px;
    }
    .schema {
      background: #f8f8f8;
      padding: 15px;
      border-radius: 4px;
      overflow-x: auto;
    }
    pre {
      margin: 0;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <h1>Skills MCP Server Inspector</h1>
  <p>Server: ${this.config.name} v${this.config.version}</p>
  <p>Total Skills: ${tools.length}</p>

  ${tools
    .map(
      (tool) => `
    <div class="skill">
      <div class="skill-name">${tool.name}</div>
      <div class="skill-description">${tool.description}</div>
      <div class="schema">
        <strong>Input Schema:</strong>
        <pre>${JSON.stringify(tool.parameters.shape, null, 2)}</pre>
      </div>
    </div>
  `
    )
    .join("")}
</body>
</html>
    `.trim();
  }
}

/**
 * Create and start a skills MCP server
 *
 * @param config - Server configuration
 * @returns Running server instance
 */
export async function createSkillsServer(config: SkillsServerConfig): Promise<SkillsMCPServer> {
  const server = new SkillsMCPServer(config);
  await server.start();
  return server;
}
