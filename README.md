# skills-kit

skills-kit is an open‑source CLI + agent builder to create and ship **Claude‑compatible skills** from natural language, with a cross‑LLM format and runners.

## 3 commands to see the magic
```bash
pnpm install
pnpm -r build
pnpm --filter @skills-kit/cli exec skills-kit create "smoketest login and capture screenshot" --out /tmp/demo-skill --provider mock
```

Then:
```bash
skills-kit lint /tmp/demo-skill
skills-kit test /tmp/demo-skill
skills-kit bundle /tmp/demo-skill --target claude
```

By default, `create/refine` runs with a deterministic mock provider (no network needed).

## Use Claude (Anthropic)
Set `ANTHROPIC_API_KEY` and pass `--provider anthropic`:
```bash
export ANTHROPIC_API_KEY=... 
skills-kit create "your idea" --out /tmp/my-skill --provider anthropic
```

`pnpm install` and Anthropic calls require network access.

## Skill format
A skill is a folder with:
- `SKILL.md` (YAML frontmatter + Markdown body)
- `policy.yaml`
- optional `scripts/`, `resources/`, `tests/`

Required frontmatter fields:
```yaml
name: my-skill
description: One sentence.
version: 0.1.0
authors: ["you"]
allowed_tools: ["fs.read", "exec"]
entrypoints:
  - scripts/run.cjs
inputs:
  type: object
  properties: {}
outputs:
  type: object
  properties: {}
```

`policy.yaml` controls sandboxing:
```yaml
network: false
fs_read: []
fs_write: []
exec_allowlist: []
domains_allowlist: []
```

## Architecture (plugin friendly)
- `@skills-kit/core`: types, `SKILL.md` parser, linting, test harness, bundler.
- `@skills-kit/agent`: create/refine orchestrator + providers (Anthropic + mock).
- `@skills-kit/cli`: user‑facing `skills-kit` binary.

Providers implement a tiny interface and can be added without changing core.

## Examples
Two “wow” skills live in `examples/`:
- `playwright-smoketest`
- `repo-pr-reviewer`

Run:
```bash
skills-kit lint examples/playwright-smoketest
skills-kit test examples/playwright-smoketest
```

## Contributing & Security
See `CONTRIBUTING.md`. Skills are untrusted: the CLI blocks path traversal and enforces policy allowlists by default.
