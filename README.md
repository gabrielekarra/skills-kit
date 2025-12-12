# skills-kit

skills-kit is a small TypeScript monorepo for generating and validating “skills”: a folder of files (metadata + a deterministic Node entrypoint + optional golden tests). It includes a CLI and libraries for linting/testing/bundling; it is **not** a hosted runtime.

Status: early/experimental (`0.1.0`), interfaces may change.

## Quickstart (local)
Requires Node 20+ and pnpm.

```bash
pnpm install
pnpm -r build
node packages/cli/dist/index.js --help
```

## CLI usage
Run the CLI from the workspace (so you don’t need a global install):

### Init (offline skeleton)
```bash
node packages/cli/dist/index.js init ./my-skill
node packages/cli/dist/index.js lint ./my-skill
node packages/cli/dist/index.js test ./my-skill
node packages/cli/dist/index.js bundle ./my-skill --target generic
```
`bundle` supports `--target generic|claude` and writes a zip plus a small `manifest.json` (the target is a label today).

### Create (mock provider, offline)
The default provider is `mock` (deterministic templates; no network). It generates a couple of built-in example skills if the prompt matches, otherwise it produces a minimal “echo” skill.

```bash
node packages/cli/dist/index.js create "Simulated Playwright login smoketest" --out ./tmp/playwright-smoketest --provider mock
node packages/cli/dist/index.js lint ./tmp/playwright-smoketest
node packages/cli/dist/index.js test ./tmp/playwright-smoketest
```

### Create / refine (Anthropic provider)
This uses the Anthropic Messages API and requires `ANTHROPIC_API_KEY` (and network access). If `--provider anthropic` is set but the key is missing, the CLI falls back to the mock provider.

```bash
export ANTHROPIC_API_KEY=...
node packages/cli/dist/index.js create "your idea" --out ./tmp/my-skill --provider anthropic --model claude-3-5-sonnet-latest
node packages/cli/dist/index.js refine ./tmp/my-skill "Add a golden test for an invalid input case" --provider anthropic
```

## Skill format
A skill is a directory containing:
- `SKILL.md` (YAML frontmatter + Markdown body)
- `policy.yaml` (declarative policy metadata)
- `scripts/run.cjs` (CommonJS entrypoint; JSON on stdin → JSON on stdout)
- optional `tests/golden.json` (golden tests)

The linter (CLI: `lint`) currently expects these frontmatter fields:
```yaml
name: my-skill
description: One sentence.
version: 0.1.0
authors: ["you"]
allowed_tools: []
entrypoints:
  - scripts/run.cjs
inputs: {}
outputs: {}
```

`policy.yaml` is parsed and linted, but not enforced as a sandbox by the golden test runner (CLI: `test`):
```yaml
network: false
fs_read: []
fs_write: []
exec_allowlist: []
domains_allowlist: []
```

`tests/golden.json` is an array of test cases; each case provides `input` plus either `expected` (deep-equals) or `assert` rules.

## Security notes
- Skills are treated as untrusted input.
- `create/refine` apply path-safe writes within the skill directory (no absolute paths / `..` traversal); built-in providers only touch `SKILL.md`, `policy.yaml`, and `scripts/`, `tests/`, `resources/`.
- The golden test runner (CLI: `test`) runs the configured entrypoint with Node and does not currently apply `policy.yaml` as an execution sandbox.

## Packages
- `packages/core`: skill parser, lint, golden test runner, bundler.
- `packages/agent`: create/refine orchestrator + providers (`mock`, `anthropic`).
- `packages/cli`: `skills-kit` binary.

## Examples
Try the checked-in examples:
```bash
node packages/cli/dist/index.js lint examples/playwright-smoketest
node packages/cli/dist/index.js test examples/playwright-smoketest
```

## Contributing
See `CONTRIBUTING.md`.
