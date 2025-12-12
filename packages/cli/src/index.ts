#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { initSkill } from "./commands/init.js";
import { lintCommand } from "./commands/lint.js";
import { testCommand } from "./commands/test.js";
import { bundleCommand } from "./commands/bundle.js";
import { createCommand } from "./commands/create.js";
import { refineCommand } from "./commands/refine.js";

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
  .command("test")
  .argument("<dir>", "skill directory")
  .description("run golden tests")
  .action(async (dir: string) => {
    const res = await testCommand(dir);
    if (res.ok) {
      console.log(chalk.green(`Tests OK (${res.passed} passed)`));
      process.exit(0);
    }
    console.error(chalk.red(`Tests failed (${res.failed} failed)`));
    for (const f of res.failures) {
      console.error(chalk.red(`- ${f.testCase.name ?? "case"}: ${f.error}`));
    }
    process.exit(1);
  });

program
  .command("bundle")
  .argument("<dir>", "skill directory")
  .requiredOption("--target <target>", "claude|generic")
  .description("bundle a skill into zip")
  .action(async (dir: string, opts: { target?: string }) => {
    const target = opts.target === "claude" ? "claude" : "generic";
    const out = await bundleCommand(dir, target);
    console.log(chalk.green(`Bundle written to ${out}`));
  });

program
  .command("create")
  .argument("<description>", "natural language description")
  .requiredOption("--out <dir>", "output directory")
  .option("--model <model>", "anthropic model id")
  .option("--provider <provider>", "mock|anthropic", "mock")
  .description("create a new skill via LLM")
  .action(
    async (
      description: string,
      opts: { out: string; model?: string; provider?: string }
    ) => {
      try {
        const provider = opts.provider === "anthropic" ? "anthropic" : "mock";
        const res = await createCommand(description, opts.out, opts.model, provider);
        if (res.ok) {
          console.log(chalk.green(`Create OK (${res.iterations} repair iterations)`));
          return;
        }
        console.error(chalk.red(`Create failed after ${res.iterations} repair iterations`));
        const firstLint = res.lint.issues.find((i) => i.severity === "error");
        if (firstLint) {
          console.error(
            chalk.red(
              `Lint: ${firstLint.code}: ${firstLint.message}${firstLint.path ? ` (${firstLint.path})` : ""}`
            )
          );
        }
        const firstTest = res.tests.failures[0];
        if (firstTest) {
          console.error(chalk.red(`Test: ${firstTest.testCase.name ?? "case"}: ${firstTest.error}`));
        }
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
  .option("--model <model>", "anthropic model id")
  .option("--provider <provider>", "mock|anthropic", "mock")
  .description("refine an existing skill via LLM")
  .action(
    async (
      dir: string,
      change: string,
      opts: { model?: string; provider?: string }
    ) => {
      try {
        const provider = opts.provider === "anthropic" ? "anthropic" : "mock";
        const res = await refineCommand(dir, change, opts.model, provider);
        if (res.ok) {
          console.log(chalk.green(`Refine OK (${res.iterations} repair iterations)`));
          return;
        }
        console.error(chalk.red(`Refine failed after ${res.iterations} repair iterations`));
        const firstLint = res.lint.issues.find((i) => i.severity === "error");
        if (firstLint) {
          console.error(
            chalk.red(
              `Lint: ${firstLint.code}: ${firstLint.message}${firstLint.path ? ` (${firstLint.path})` : ""}`
            )
          );
        }
        const firstTest = res.tests.failures[0];
        if (firstTest) {
          console.error(chalk.red(`Test: ${firstTest.testCase.name ?? "case"}: ${firstTest.error}`));
        }
        process.exit(1);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(msg));
        process.exit(1);
      }
    }
  );

void program.parseAsync(process.argv);
