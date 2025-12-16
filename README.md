<div align="center">

# skills-kit

**Create AI skills once, run them everywhere.**

[![npm](https://img.shields.io/npm/v/@skills-kit/cli.svg)](https://www.npmjs.com/package/@skills-kit/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6.svg)](https://www.typescriptlang.org/)
[![Discord](https://img.shields.io/discord/YOUR_SERVER_ID?color=7289da&label=Discord)](https://discord.gg/wwYpdTPCPR)

[Quick Start](#quick-start) · [Examples](#examples) · [Discord](https://discord.gg/wwYpdTPCPR)

</div>

---

Skills are portable AI capabilities. Define inputs, write logic, test once — then use with Claude, GPT, Gemini, or any MCP-compatible agent. No vendor lock-in.

---

## Quick Start

```bash
# Install
npm install -g @skills-kit/cli

# Create a skill
skills-kit init my-skill

# Validate & test
skills-kit lint my-skill && skills-kit test my-skill

# Serve via MCP
skills-kit serve my-skill --port 3000
```

Use with any LLM:

```typescript
import { MCPClient, MCPAgent } from 'mcp-use';
import { ChatOpenAI } from '@langchain/openai';

const client = MCPClient.fromDict({
  mcpServers: { skills: { url: 'http://localhost:3000/sse' } }
});

const agent = new MCPAgent({
  llm: new ChatOpenAI({ model: 'gpt-4o' }),
  client
});

await agent.run('Use my-skill to do something');
```

## What's a Skill?

```
my-skill/
├── SKILL.md        # Schema + docs (inputs, outputs, metadata)
├── policy.yaml     # Permissions (network, fs, exec)
├── scripts/run.cjs # Your logic (JSON in → JSON out)
└── tests/golden.json
```

Skills receive JSON via stdin, return JSON via stdout. Language-agnostic. Easy to test.

## Features

| | |
|---|---|
| 🔌 **MCP Native** | Works with any MCP client out of the box |
| 📁 **File Processing** | PDFs, images, CSVs with compression & streaming |
| 🧪 **Golden Tests** | Validate skills before deployment |
| 🤖 **AI Generation** | Create skills from natural language |
| 📦 **Bundling** | Package for npm or custom registries |
| 🔒 **Policies** | Declarative security permissions |

## CLI

```bash
skills-kit init <path>              # Create from template
skills-kit create "description"     # AI-generate skill
skills-kit lint <path>              # Validate
skills-kit test <path>              # Run golden tests
skills-kit serve <path> --inspector # MCP server + web UI
skills-kit bundle <path>            # Package for distribution
```

## MCP Integration

**With mcp-use:**

```typescript
const client = MCPClient.fromDict({
  mcpServers: { skills: { url: 'http://localhost:3000/sse' } }
});
```

**With Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "skills": {
      "command": "skills-kit",
      "args": ["serve", "./my-skills", "--transport", "stdio"]
    }
  }
}
```

## Examples

Coming soon! We're working on example skills to showcase:
- Browser automation with Playwright
- PDF text extraction
- Streaming CSV analysis
- Image processing
- API integrations

## Links

[Discord](https://discord.gg/wwYpdTPCPR) · [Contributing](./CONTRIBUTING.md) · [License](./LICENSE)

---

<div align="center">

**MIT © [Gabriele Karra](https://github.com/gabrielekarra)**

</div>
