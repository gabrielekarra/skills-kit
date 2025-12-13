<div align="center">
  <img src=".github/skills-kit logo.svg" alt="skills-kit" width="600">

  <p><strong>Write AI skills once, run them everywhere.</strong><br>The universal standard for portable AI capabilities across any LLM.</p>

  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  [![Node Version](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
</div>

---

## Why skills-kit?

**Stop rewriting the same AI tools for every LLM provider.**

Claude skills don't work with OpenAI. OpenAI functions don't work with Gemini. Every time you switch providers, you rewrite everything.

**skills-kit solves this:** Write your skill once in a universal format, then generate platform-specific integrations automatically.

---

## Quick Start

### Install

```bash
npm install -g @skills-kit/cli
```

### Set API Key

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Get your key from [console.anthropic.com](https://console.anthropic.com/)

### Create a Skill

```bash
# AI-powered creation
skills-kit create "Validate email addresses" --out ./email-validator

# Test it
skills-kit test ./email-validator

# Run it
echo '{"email": "test@example.com"}' | skills-kit run ./email-validator

# Bundle for different platforms
skills-kit bundle ./email-validator --target openai
skills-kit bundle ./email-validator --target gemini
skills-kit bundle ./email-validator --target claude
```

---

## Key Features

### 🚀 Write Once, Run Anywhere

```bash
skills-kit bundle ./my-skill --target openai   # OpenAI function calling
skills-kit bundle ./my-skill --target gemini   # Gemini function declaration
skills-kit bundle ./my-skill --target claude   # Claude native format
skills-kit bundle ./my-skill --target generic  # Universal format
```

### 🤖 AI-Powered Generation

Describe what you want, get a complete working skill:

```bash
skills-kit create "Parse CSV and detect anomalies" --out ./csv-parser
# Creates: SKILL.md, scripts/run.cjs, policy.yaml, tests/golden.json
```

### 🧪 Built-in Testing

Golden tests ensure correctness:

```bash
skills-kit test ./my-skill
```

### 🔒 Security Policies

Every skill has enforceable security policies:

```yaml
# policy.yaml
network: false
fs_read: []
fs_write: []
exec_allowlist: []
```

---

## Universal Skill Format

Every skill is a directory:

```
my-skill/
├── SKILL.md           # Manifest (YAML frontmatter + markdown)
├── policy.yaml        # Security policy
├── scripts/
│   └── run.cjs       # Entrypoint (JSON in → JSON out)
└── tests/
    └── golden.json   # Test cases
```

### Example: SKILL.md

```markdown
---
name: email-validator
version: 1.0.0
description: Validate email addresses
entrypoints:
  - scripts/run.cjs
inputs:
  type: object
  properties:
    email: { type: string }
  required: [email]
outputs:
  type: object
  properties:
    valid: { type: boolean }
    domain: { type: string }
---

# Email Validator

Validates email addresses using RFC 5322 standards.
```

### Example: scripts/run.cjs

```javascript
#!/usr/bin/env node

const chunks = [];
process.stdin.on('data', chunk => chunks.push(chunk));
process.stdin.on('end', () => {
  const input = JSON.parse(Buffer.concat(chunks).toString());

  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const valid = regex.test(input.email);

  console.log(JSON.stringify({
    valid,
    domain: valid ? input.email.split('@')[1] : null
  }));
});
```

### Example: tests/golden.json

```json
[
  {
    "name": "valid-email",
    "input": {"email": "test@example.com"},
    "expected": {"valid": true, "domain": "example.com"}
  },
  {
    "name": "invalid-email",
    "input": {"email": "not-an-email"},
    "expected": {"valid": false, "domain": null}
  }
]
```

---

## CLI Commands

```bash
# Check system setup
skills-kit doctor

# Create new skill (AI-powered)
skills-kit create "Description" --out ./skill-dir

# Create skeleton manually
skills-kit init ./skill-dir

# Validate skill
skills-kit lint ./skill-dir

# Run tests
skills-kit test ./skill-dir

# Execute skill
skills-kit run ./skill-dir --json '{"key": "value"}'
skills-kit run ./skill-dir --input data.json
echo '{"key": "value"}' | skills-kit run ./skill-dir

# Bundle for platforms
skills-kit bundle ./skill-dir --target openai
skills-kit bundle ./skill-dir --target gemini
skills-kit bundle ./skill-dir --target claude
skills-kit bundle ./skill-dir --target generic

# Refine existing skill
skills-kit refine ./skill-dir "Add support for multiple emails"
```

---

## Cross-Platform Adapters

Each bundle generates platform-specific integration files:

| Platform | Generated Files | Description |
|----------|----------------|-------------|
| **OpenAI** | `tool.json`, `system_prompt.txt`, `usage.md` | Function calling schema + examples |
| **Gemini** | `function.json`, `system_instruction.txt`, `usage.md` | Function declaration + examples |
| **Claude** | `notes.md` | Integration notes (uses native format) |
| **Generic** | `README.md` | Universal integration guide |

All bundles include Python and JavaScript integration examples.

---

## Using Skills with LLMs

### Complete Workflow

1. **Create and bundle your skill:**

```bash
# Create a skill
skills-kit create "Validate email addresses" --out ./email-validator

# Test it locally
skills-kit test ./email-validator

# Bundle for OpenAI
skills-kit bundle ./email-validator --target openai

# Extract the bundle
cd email-validator
unzip email-validator-openai.zip -d openai-bundle
```

2. **Integrate with OpenAI (Python):**

```python
import openai
import json
import subprocess

# Load the tool definition
with open('openai-bundle/adapters/openai/tool.json') as f:
    tool_def = json.load(f)

# Use with ChatGPT
client = openai.OpenAI()
response = client.chat.completions.create(
    model="gpt-4",
    messages=[
        {"role": "user", "content": "Validate test@example.com"}
    ],
    tools=[tool_def],
    tool_choice="auto"
)

# If GPT calls the tool, execute the skill
if response.choices[0].message.tool_calls:
    tool_call = response.choices[0].message.tool_calls[0]
    args = json.loads(tool_call.function.arguments)

    # Execute the skill
    result = subprocess.run(
        ['node', 'scripts/run.cjs'],
        input=json.dumps(args),
        capture_output=True,
        text=True,
        cwd='openai-bundle'
    )

    output = json.loads(result.stdout)
    print(f"Valid: {output['valid']}, Domain: {output['domain']}")
```

3. **Integrate with OpenAI (JavaScript):**

```javascript
import OpenAI from 'openai';
import fs from 'fs';
import { spawn } from 'child_process';

// Load the tool definition
const toolDef = JSON.parse(
  fs.readFileSync('openai-bundle/adapters/openai/tool.json', 'utf8')
);

// Use with ChatGPT
const openai = new OpenAI();
const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [
    { role: 'user', content: 'Validate test@example.com' }
  ],
  tools: [toolDef],
  tool_choice: 'auto'
});

// If GPT calls the tool, execute the skill
if (response.choices[0].message.tool_calls) {
  const toolCall = response.choices[0].message.tool_calls[0];
  const args = JSON.parse(toolCall.function.arguments);

  // Execute the skill
  const proc = spawn('node', ['scripts/run.cjs'], {
    cwd: 'openai-bundle'
  });

  proc.stdin.write(JSON.stringify(args));
  proc.stdin.end();

  let output = '';
  proc.stdout.on('data', (data) => output += data);
  proc.stdout.on('end', () => {
    const result = JSON.parse(output);
    console.log(`Valid: ${result.valid}, Domain: ${result.domain}`);
  });
}
```

**The same pattern works for Gemini, Claude, and other LLMs.** Each bundle includes complete integration examples in the `usage.md` file.

---

## Architecture

```
┌─────────────────────────────┐
│    Developer (write once)    │
└──────────────┬──────────────┘
               │
       ┌───────▼────────┐
       │ Universal Format│
       │  SKILL.md      │
       │  policy.yaml   │
       │  run.cjs       │
       │  golden.json   │
       └───────┬────────┘
               │
    ┌──────────┼──────────┬─────────┐
    │          │          │         │
┌───▼───┐ ┌───▼───┐ ┌───▼───┐ ┌───▼───┐
│OpenAI │ │Gemini │ │Claude │ │Generic│
└───────┘ └───────┘ └───────┘ └───────┘
```

### Package Structure

```
packages/
├── core/       # Parsing, linting, bundling, testing
├── runner/     # Execution with policy enforcement
├── agent/      # AI-powered generation (Claude)
└── cli/        # Command-line interface
```

---

## Development

### Setup

```bash
git clone https://github.com/your-org/skills-kit.git
cd skills-kit
pnpm install
pnpm build
pnpm test
```

### Run CLI Locally

```bash
node packages/cli/dist/index.js --help
```

### Project Structure

```
skills-kit/
├── packages/
│   ├── core/      # @skills-kit/core
│   ├── runner/    # @skills-kit/runner
│   ├── agent/     # @skills-kit/agent
│   └── cli/       # @skills-kit/cli
└── examples/      # Example skills
```

---

## Contributing

Contributions welcome! To contribute:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Run `pnpm build && pnpm test && pnpm lint`
6. Submit a Pull Request

### Adding New Adapters

To add support for a new LLM platform:

1. Create `packages/core/src/adapters/platform.ts`
2. Implement generator functions
3. Add to `packages/core/src/bundle.ts`
4. Add tests

Example:

```typescript
// packages/core/src/adapters/mistral.ts
import type { ParsedSkill } from "../skill.js";

export function generateMistralFunction(skill: ParsedSkill) {
  return {
    name: skill.frontmatter.name,
    description: skill.frontmatter.description,
    parameters: skill.frontmatter.inputs
  };
}
```

---

## License

MIT License - see [LICENSE](LICENSE)

Copyright (c) 2024 skills-kit contributors

---

⭐ Star this repo if you believe in portable AI skills
