import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool
} from "@modelcontextprotocol/sdk/types.js";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { watch } from "chokidar";
import { loadSkillsFromDirectory, loadSkillsFromPaths } from "./skill-loader.js";
import { skillToToolDefinition } from "./skill-to-tool.js";
import type { SkillsServerConfig, LoadedSkill } from "./types.js";
import type { z } from "zod";

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown> & { type: "object" };
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
  private streamableTransport?: StreamableHTTPServerTransport;

  private sendJson(res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
    res.writeHead(status, { "Content-Type": "application/json", ...headers });
    res.end(JSON.stringify(body));
  }

  private async readRequestBody(req: http.IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString("utf8");
  }

  private matchWellKnown(pathname: string, origin: string): { issuer: string; type: "oauth" | "oidc" } | null {
    const basePath = this.config.basePath;
    const prefixes = [
      {
        prefix: `${basePath}/.well-known/oauth-authorization-server`,
        base: `${origin}${basePath}`,
        type: "oauth" as const
      },
      {
        prefix: `${basePath}/.well-known/openid-configuration`,
        base: `${origin}${basePath}`,
        type: "oidc" as const
      }
    ];

    if (basePath) {
      prefixes.push(
        {
          prefix: "/.well-known/oauth-authorization-server",
          base: origin,
          type: "oauth" as const
        },
        {
          prefix: "/.well-known/openid-configuration",
          base: origin,
          type: "oidc" as const
        }
      );
    }

    for (const entry of prefixes) {
      if (pathname.startsWith(entry.prefix)) {
        const suffix = pathname.slice(entry.prefix.length);
        return { issuer: `${entry.base}${suffix}`, type: entry.type };
      }
    }

    return null;
  }

  private buildAuthMetadata(issuer: string, type: "oauth" | "oidc") {
    const metadata = {
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "client_credentials"],
      token_endpoint_auth_methods_supported: ["none"]
    };

    if (type === "oidc") {
      return {
        ...metadata,
        jwks_uri: `${issuer}/.well-known/jwks.json`,
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["none"]
      };
    }

    return metadata;
  }

  /**
   * Log to stderr (safe for stdio transport) or stdout (SSE mode)
   * In stdio mode, stdout is reserved for JSONRPC, so all logs must go to stderr
   */
  private log(message: string) {
    if (this.config.transport === "stdio") {
      console.error(message);
    } else {
      console.log(message);
    }
  }

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
        inputSchema: tool.inputSchema ?? {
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
    this.log("Loading skills...");

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

      this.log(`  ✓ Loaded skill: ${skillName}`);
    }

    this.log(`Loaded ${skills.length} skill(s)`);
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
        this.log(`\nDetected change in ${path}, reloading skills...`);
        this.loadSkills()
          .then(() => {
            this.log("Skills reloaded successfully");
          })
          .catch((error: unknown) => {
            console.error("Failed to reload skills:", error);
          });
      }
    });

    this.log("Watch mode enabled - monitoring for changes");
  }

  async start() {
    // Load skills
    await this.loadSkills();

    if (this.config.transport === "stdio") {
      // STDIO transport (for Claude Desktop)
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      this.log("MCP server running on stdio");
    } else {
      // Create Streamable HTTP transport (stateless mode for simplicity)
      this.streamableTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });

      // Connect server to transport
      await this.server.connect(this.streamableTransport);

      // HTTP server with both Streamable HTTP (primary) and SSE (fallback)
      this.httpServer = http.createServer((req, res) => {
        void (async () => {
          const host = req.headers.host ?? `localhost:${this.config.port}`;
          const url = new URL(req.url ?? "/", `http://${host}`);
          const basePath = this.config.basePath;
          const origin = `http://${host}`;

          const wellKnown = this.matchWellKnown(url.pathname, origin);
          if (wellKnown) {
            this.sendJson(res, 200, this.buildAuthMetadata(wellKnown.issuer, wellKnown.type));
            return;
          }

          if (url.pathname.endsWith("/.well-known/jwks.json")) {
            this.sendJson(res, 200, { keys: [] });
            return;
          }

          if (url.pathname.endsWith("/oauth/authorize")) {
            if (req.method !== "GET") {
              res.writeHead(405, { "Content-Type": "text/plain" });
              res.end("Method Not Allowed");
              return;
            }

            const responseType = url.searchParams.get("response_type");
            if (responseType && responseType !== "code") {
              this.sendJson(res, 400, { error: "unsupported_response_type" });
              return;
            }

            const redirectUri = url.searchParams.get("redirect_uri");
            if (!redirectUri) {
              this.sendJson(res, 400, { error: "invalid_request", error_description: "redirect_uri is required" });
              return;
            }

            const state = url.searchParams.get("state");
            const redirect = new URL(redirectUri);
            redirect.searchParams.set("code", "skills-kit-local");
            if (state) redirect.searchParams.set("state", state);
            res.writeHead(302, { Location: redirect.toString() });
            res.end();
            return;
          }

          if (url.pathname.endsWith("/oauth/token")) {
            if (req.method !== "POST") {
              res.writeHead(405, { "Content-Type": "text/plain" });
              res.end("Method Not Allowed");
              return;
            }

            const rawBody = await this.readRequestBody(req);
            let scope = "mcp";

            if (req.headers["content-type"]?.includes("application/json")) {
              try {
                const json = JSON.parse(rawBody) as { scope?: string };
                if (json.scope) scope = json.scope;
              } catch {
                // ignore invalid JSON and fall back to default scope
              }
            } else {
              const params = new URLSearchParams(rawBody);
              scope = params.get("scope") ?? scope;
            }

            this.sendJson(
              res,
              200,
              {
                access_token: "skills-kit-local",
                token_type: "bearer",
                expires_in: 3600,
                scope
              },
              { "Cache-Control": "no-store", Pragma: "no-cache" }
            );
            return;
          }

          // MCP endpoint (Streamable HTTP) - handles POST requests
          if (url.pathname === `${basePath}/mcp` || url.pathname === basePath || url.pathname === `${basePath}/`) {
            this.log(`MCP request from ${req.socket.remoteAddress} (${req.method})`);

            try {
              await this.streamableTransport!.handleRequest(req, res);
            } catch (error) {
              console.error("Failed to handle MCP request:", error);
              if (!res.headersSent) {
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Internal server error" }));
              }
            }
            return;
          }

          // SSE endpoint (legacy fallback)
          if (url.pathname === `${basePath}/sse`) {
            this.log(`SSE connection from ${req.socket.remoteAddress}`);

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
        })().catch((error: unknown) => {
          console.error("Failed to handle HTTP request:", error);
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Internal server error" }));
          }
        });
      });

      await new Promise<void>((resolve) => {
        this.httpServer!.listen(this.config.port, () => {
          resolve();
        });
      });

      const baseUrl = `http://localhost:${this.config.port}${this.config.basePath}`;
      this.log(`\nMCP server running at ${baseUrl}`);
      this.log(`MCP endpoint: ${baseUrl}/mcp (Streamable HTTP)`);
      this.log(`SSE endpoint: ${baseUrl}/sse (legacy)`);
      this.log(`Health check: ${baseUrl}/health`);

      if (this.config.enableInspector) {
        this.log(`Inspector: ${baseUrl}/inspector`);
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
