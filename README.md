# skills-kit

> **The universal package manager for AI capabilities.** Build once, run on any LLM.

[![CI](https://github.com/your-org/skills-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/skills-kit/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## The Problem

**AI agents can't share code.**

Every company building with LLMs faces the same bottleneck: skills (tools/functions) are locked to one provider. A Claude skill doesn't work with OpenAI. An OpenAI function doesn't work with Gemini. Teams rewrite the same capabilities 3-4 times.

**Result**: Slow development, vendor lock-in, no ecosystem.

There's no "npm for AI skills" — until now.

---

## Our Solution

**skills-kit** is the first universal standard + toolchain for portable AI skills.

Write a skill once → runs on Claude, OpenAI, Gemini, or any agent runtime.

```bash
# Set your Anthropic API key
export ANTHROPIC_API_KEY=sk-ant-...

# Create a skill using Claude AI
skills-kit create "Validate API contracts" --out ./validator

# Test it (golden tests ensure correctness)
skills-kit test ./validator

# Ship it (generates runtime-specific adapters)
skills-kit bundle ./validator --target openai
skills-kit bundle ./validator --target gemini
skills-kit bundle ./validator --target claude
```

**That's it.** One skill, every platform.

---

## How It Works

### 1. Universal Format
Every skill is a directory with:
- `SKILL.md` - Manifest (inputs, outputs, metadata)
- `scripts/run.cjs` - Entrypoint (JSON in → JSON out)
- `policy.yaml` - Security policy (fs, network, exec)
- `tests/golden.json` - Deterministic test suite

### 2. Cross-Platform Adapters
Bundle command generates runtime-specific integration:

#### ✅ Implemented Adapters

**OpenAI** (`--target openai`)
- `adapters/openai/tool.json` - Function calling schema
- `adapters/openai/system_prompt.txt` - When to invoke
- `adapters/openai/usage.md` - Integration examples (Python/JS)

**Gemini** (`--target gemini`)
- `adapters/gemini/function.json` - Function declaration
- `adapters/gemini/system_instruction.txt` - System instruction
- `adapters/gemini/usage.md` - Integration examples (Python/JS)

**Claude** (`--target claude`)
- `adapters/claude/notes.md` - Native format + integration notes
- Maintains Claude-compatible directory structure

**Generic** (`--target generic`)
- `README.md` - Universal integration guide
- Works with any LLM runtime

### 3. Built-In Security
Policy enforcement prevents:
- Path traversal attacks
- Unauthorized network access
- Arbitrary code execution
- Data exfiltration

(Best-effort in Node.js; full isolation requires containers)

### 4. Test-Driven Development
Golden tests ensure skills work before deployment:
```json
[
  {
    "name": "valid-case",
    "input": {"url": "https://api.example.com"},
    "expected": {"valid": true, "errors": []}
  }
]
```

Run `skills-kit test` → instant feedback.

---

## Why This Wins

| Traditional Approach | skills-kit |
|---------------------|------------|
| Rewrite for each LLM | Write once |
| No testing standard | Golden tests built-in |
| No security model | Policy enforcement |
| Vendor lock-in | Fully portable |
| No distribution | Bundle + ship |
| Manual integration | Auto-generated adapters |

**10x better, not 10% better.**

---

## Market Opportunity

**Every company building AI agents needs this.**

- **Enterprises**: Multi-LLM strategies to avoid vendor lock-in
- **Agent platforms**: Need skill marketplaces (Replit, Vercel, etc.)
- **OSS projects**: LangChain, AutoGPT, etc. need interoperability
- **Individual devs**: Building products on Claude/OpenAI/Gemini

**TAM**: $X billion AI development tools market (same buyers as GitHub, npm, Docker)

---

## What We've Built

✅ **Core toolchain** (parser, linter, runner, bundler)
✅ **Security layer** (policy enforcement + sandboxing)
✅ **Multi-target bundler** (OpenAI, Claude, generic)
✅ **AI-powered creation** (generates skills from natural language)
✅ **Golden test harness** (TDD for AI skills)
✅ **CLI** (3-command workflow)
✅ **TypeScript SDK** (for programmatic use)

**All open source. MIT licensed. Production-ready.**

Powered by Claude AI for intelligent skill generation with automatic testing and validation.

---

## Quickstart

```bash
# Install
npm install -g @skills-kit/cli

# Set your Anthropic API key
export ANTHROPIC_API_KEY=sk-ant-...

# Create a skill using Claude AI
skills-kit create "Parse CSV and detect anomalies" --out ./csv-parser

# Test it
skills-kit test ./csv-parser

# Run it
echo '{"csv": "id,value\n1,100\n2,999"}' | skills-kit run ./csv-parser

# Ship it to multiple platforms
skills-kit bundle ./csv-parser --target openai
skills-kit bundle ./csv-parser --target gemini
skills-kit bundle ./csv-parser --target claude

# See what was generated
unzip -l ./csv-parser/*-openai.zip
unzip -l ./csv-parser/*-gemini.zip
```

Get your API key from [console.anthropic.com](https://console.anthropic.com/)

---

## Architecture

```
┌─────────────────────────────────────┐
│  Developer writes skill (once)      │
└─────────────┬───────────────────────┘
              │
      ┌───────▼────────┐
      │   SKILL.md     │  Standard format
      │   policy.yaml  │  + security
      │   run.cjs      │  + tests
      │   golden.json  │
      └───────┬────────┘
              │
    ┌─────────┼─────────┬─────────┐
    │         │         │         │
┌───▼────┐ ┌──▼───┐ ┌──▼────┐ ┌──▼─────┐
│ OpenAI │ │Gemini│ │ Claude│ │Generic │
│ bundle │ │bundle│ │ bundle│ │ bundle │
└────────┘ └──────┘ └───────┘ └────────┘
```

### Adapter Coverage

| Platform | Status | Includes |
|----------|--------|----------|
| **OpenAI** | ✅ Implemented | Function schema, system prompt, usage docs |
| **Gemini** | ✅ Implemented | Function declaration, system instruction, usage docs |
| **Claude** | ✅ Implemented | Native format + integration notes |
| **Generic** | ✅ Implemented | Universal README for any runtime |

---

## Traction Plan

**Phase 1** (Now): Open source launch + community
**Phase 2** (Q2): Skill marketplace (developers publish, others consume)
**Phase 3** (Q3): Enterprise SaaS (private registries, compliance, support)
**Phase 4** (Q4): Platform partnerships (Replit, Vercel, etc.)

**Revenue model**: OSS core + paid hosted registry + enterprise features

---

## Why Now?

1. **Multi-LLM world emerging**: No one trusts single-vendor lock-in
2. **Agent explosion**: Every company building agents needs tools
3. **Security requirements**: Enterprises won't deploy untested/unsafe skills
4. **Developer pain is real**: Teams rewriting same code 3-4x

**We're solving the #1 bottleneck in agentic AI development.**

---

## Team & Vision

**Vision**: Become the "npm for AI" — the universal package manager for AI capabilities.

Just like npm enabled JavaScript ecosystem growth, skills-kit will enable the AI agent ecosystem.

**Open source strategy**:
- Core toolchain: MIT licensed (community growth)
- Enterprise features: Hosted registry, compliance, SSO (revenue)

---

## Get Started

```bash
# Production use
npm install -g @skills-kit/cli
skills-kit doctor  # Check system setup

# Development
git clone https://github.com/your-org/skills-kit
cd skills-kit
pnpm install && pnpm build
pnpm test
```

**Documentation**: [Full CLI reference](https://skills-kit.dev/docs)
**Examples**: Check `examples/playwright-smoketest`
**Slack**: [Join our community](https://skills-kit.dev/slack)

---

## Contributing

We're building this in public. Contributions welcome:

- 🐛 Bug reports → [Issues](https://github.com/your-org/skills-kit/issues)
- 💡 Feature requests → [Discussions](https://github.com/your-org/skills-kit/discussions)
- 🔧 Code contributions → [CONTRIBUTING.md](CONTRIBUTING.md)
- 📖 Documentation → [docs/](docs/)

---

## License

MIT — see [LICENSE](LICENSE)

---

**We're making AI skills portable, testable, and secure.**

Star this repo if you believe in an open AI ecosystem ⭐
