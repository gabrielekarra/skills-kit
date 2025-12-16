<div align="center">

<img src=".github/logo.svg" alt="skills-kit" width="280">

<br>

### Build AI skills once. Run them with any LLM.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Discord](https://img.shields.io/badge/Discord-Join%20us-5865F2?logo=discord&logoColor=white)](https://discord.gg/wwYpdTPCPR)

</div>

<br>

**Skills Kit** is an open-source framework for building portable AI capabilities. Write your logic once, then run it with Claude, GPT, Gemini, or any [MCP](https://modelcontextprotocol.io)-compatible agent.

**No vendor lock-in. No rewrites. Just skills that work everywhere.**

<br>

## Why Skills Kit?

| Problem | Solution |
|---------|----------|
| AI integrations break when you switch models | Skills are model-agnostic via MCP |
| Custom tools are hard to test and validate | Built-in golden tests + linting |
| Sharing AI capabilities requires boilerplate | Bundle and distribute via npm |
| Security is an afterthought | Declarative permission policies |

<br>

## What's Inside a Skill?

```
my-skill/
├── SKILL.md          # Schema: inputs, outputs, description
├── policy.yaml       # Permissions: network, filesystem, exec
├── scripts/run.cjs   # Your code (JSON in → JSON out)
└── tests/golden.json # Test cases
```

Skills are simple: receive JSON via stdin, return JSON via stdout. Use any language.

<br>

## CLI Reference

| Command | Description |
|---------|-------------|
| `skills-kit init <path>` | Create a new skill from template |
| `skills-kit create "desc"` | Generate a skill with AI |
| `skills-kit lint <path>` | Validate skill structure |
| `skills-kit test <path>` | Run golden tests |
| `skills-kit serve <path>` | Start MCP server |
| `skills-kit bundle <path>` | Package for distribution |

<br>

## Features

- **MCP Native** — First-class support for the Model Context Protocol
- **Language Agnostic** — Write skills in JavaScript, Python, Bash, or any language
- **Golden Tests** — Snapshot testing to catch regressions
- **Security Policies** — Declare what your skill can access
- **AI Generation** — Describe what you want, get a working skill
- **Bundling** — Package and share via npm or private registries

<br>

## Community

- [Discord](https://discord.gg/wwYpdTPCPR) — Get help and share what you're building
- [Contributing](./CONTRIBUTING.md) — We welcome PRs
- [Issues](https://github.com/gabrielekarra/skills-kit/issues) — Report bugs or request features

<br>

---

<div align="center">

MIT License · Made by [Gabriele Karra](https://github.com/gabrielekarra)

</div>
