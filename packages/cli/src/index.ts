#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { initSkill } from "./commands/init.js";
import { lintCommand } from "./commands/lint.js";
import { bundleCommand } from "./commands/bundle.js";
import { createCommand } from "./commands/create.js";
import { refineCommand } from "./commands/refine.js";
import { runCommand } from "./commands/run.js";
import { runDoctor } from "./commands/doctor.js";
import { serveCommand } from "./commands/serve.js";

const program = new Command();

program.name("skills-kit").description("Create and ship Claude-compatible skills").version("0.1.0");

program
  .command("init")
  .argument("<dir>", "skill directory")
  .description("create a skill skeleton")
  .action(async (dir: string) => {
    const root = await initSkill(dir);
    console.log(chalk.green(`Initialized skill at ${root}`));
  });

program
  .command("lint")
  .argument("<dir>", "skill directory")
  .description("validate a skill")
  .action(async (dir: string) => {
    const res = await lintCommand(dir);
    if (res.ok) {
      console.log(chalk.green("Lint OK"));
    } else {
      console.error(chalk.red("Lint failed"));
    }
    for (const issue of res.issues) {
      const color = issue.severity === "error" ? chalk.red : chalk.yellow;
      console.log(color(`${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}${issue.path ? ` (${issue.path})` : ""}`));
    }
    process.exit(res.ok ? 0 : 1);
  });

program
  .command("bundle")
  .argument("<dir>", "skill directory")
  .requiredOption("--target <target>", "claude|openai|gemini|generic")
  .description("bundle a skill into zip")
  .action(async (dir: string, opts: { target?: string }) => {
    const targetMap: Record<string, "claude" | "openai" | "gemini" | "generic"> = {
      claude: "claude",
      openai: "openai",
      gemini: "gemini",
      generic: "generic"
    };
    const target = targetMap[opts.target || "generic"] || "generic";
    const out = await bundleCommand(dir, target);
    console.log(chalk.green(`Bundle written to ${out}`));
  });

program
  .command("create")
  .argument("<description>", "natural language description")
  .requiredOption("--out <dir>", "output directory")
  .option("--provider <provider>", "AI provider: anthropic (default) or openai", "anthropic")
  .option("--model <model>", "model id (anthropic: claude-sonnet-4-5-latest, openai: gpt-4o)")
  .option("--context <files...>", "context files (PDF, images, etc.) to provide as visual reference")
  .option("--text-only", "extract text from PDFs instead of sending full binary (reduces token usage)")
  .description("create a new skill using AI")
  .action(
    async (
      description: string,
      opts: { out: string; provider?: string; model?: string; context?: string[]; textOnly?: boolean }
    ) => {
      try {
        const providerType = opts.provider === "openai" ? "openai" : "anthropic";
        const { validateApiKey } = await import("./commands/create.js");
        const validation = validateApiKey(providerType);
        if (!validation.valid) {
          console.error(chalk.red(`Error: ${validation.message}`));
          process.exit(1);
        }
        console.log(chalk.blue(`Using provider: ${providerType}`));
        if (opts.context && opts.context.length > 0) {
          console.log(chalk.blue(`Loading ${opts.context.length} context file(s)${opts.textOnly ? " (text-only mode)" : ""}...`));
        }
        const res = await createCommand(description, opts.out, {
          model: opts.model,
          contextFiles: opts.context,
          providerType,
          textOnly: opts.textOnly
        });
        if (res.ok) {
          console.log(chalk.green("Create OK"));
          return;
        }
        console.error(chalk.red("Create failed"));
        process.exit(1);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(msg));
        process.exit(1);
      }
    }
  );

program
  .command("refine")
  .argument("<dir>", "skill directory")
  .argument("<change>", "requested change")
  .option("--model <model>", "anthropic model id (default: claude-sonnet-4-5-latest)")
  .description("refine an existing skill using Claude AI")
  .action(
    async (
      dir: string,
      change: string,
      opts: { model?: string }
    ) => {
      try {
        if (!process.env.ANTHROPIC_API_KEY) {
          console.error(chalk.red("Error: ANTHROPIC_API_KEY environment variable is not set."));
          console.error(chalk.yellow("\nTo use the refine command, you need an Anthropic API key:"));
          console.error(chalk.white("1. Get your API key from https://console.anthropic.com/"));
          console.error(chalk.white("2. Set it: export ANTHROPIC_API_KEY=sk-ant-..."));
          console.error(chalk.white("3. Run the command again\n"));
          process.exit(1);
        }
        const res = await refineCommand(dir, change, opts.model);
        if (res.ok) {
          console.log(chalk.green("Refine OK"));
          return;
        }
        console.error(chalk.red("Refine failed"));
        process.exit(1);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(msg));
        process.exit(1);
      }
    }
  );

program
  .command("run")
  .argument("<dir>", "skill directory")
  .option("--input <file>", "input JSON file")
  .option("--json <json>", "inline JSON input")
  .description("execute a skill")
  .action(async (dir: string, opts: { input?: string; json?: string }) => {
    try {
      const result = await runCommand(dir, opts);
      if (result.ok) {
        console.log(JSON.stringify(result.output, null, 2));
        process.exit(0);
      }
      console.error(chalk.red(`Error: ${result.error}`));
      if (result.logs) {
        console.error(chalk.gray(result.logs));
      }
      process.exit(1);
    } catch (err) {
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

program
  .command("doctor")
  .description("check system configuration")
  .action(async () => {
    console.log(chalk.blue("Running diagnostics...\n"));
    const result = await runDoctor();

    for (const check of result.checks) {
      const icon = check.status === "ok" ? "✓" : check.status === "warning" ? "⚠" : "✗";
      const color = check.status === "ok" ? chalk.green : check.status === "warning" ? chalk.yellow : chalk.red;
      console.log(color(`${icon} ${check.name}: ${check.message}`));
    }

    console.log();
    if (result.ok) {
      console.log(chalk.green("All required checks passed."));
      process.exit(0);
    } else {
      console.log(chalk.red("Some checks failed. Please fix errors above."));
      process.exit(1);
    }
  });

program
  .command("serve")
  .argument("<paths...>", "skill directories or directories containing skills (multiple paths supported)")
  .option("-p, --port <port>", "port number", "3000")
  .option("-t, --transport <type>", "transport type: sse | stdio", "sse")
  .option("--base-path <path>", "base path for endpoints", "")
  .option("--inspector", "enable inspector UI", false)
  .option("-w, --watch", "watch for file changes and hot-reload", false)
  .option("--timeout <ms>", "skill execution timeout in milliseconds", "30000")
  .option("--install-deps", "install skill dependencies with npm before serving", false)
  .description("serve skills as MCP tools via SSE or stdio")
  .action(
    async (
      paths: string[],
      opts: {
        port?: string;
        transport?: string;
        basePath?: string;
        inspector?: boolean;
        watch?: boolean;
        timeout?: string;
        installDeps?: boolean;
      }
    ) => {
      try {
        const port = opts.port ? parseInt(opts.port, 10) : 3000;
        const timeout = opts.timeout ? parseInt(opts.timeout, 10) : 30000;
        const transport = opts.transport === "stdio" ? "stdio" : "sse";

        await serveCommand(paths, {
          port,
          transport,
          basePath: opts.basePath,
          inspector: opts.inspector,
          watch: opts.watch,
          timeout,
          installDeps: opts.installDeps
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(msg));
        process.exit(1);
      }
    }
  );

void program.parseAsync(process.argv);
