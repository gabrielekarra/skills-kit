<div align="center">
  <img src=".github/skills-kit logo.svg" alt="skills-kit" width="600">

  <p><strong>Write AI skills once, run them everywhere.</strong><br>The universal standard for portable AI capabilities across any LLM.</p>
</div>

[![CI](https://github.com/your-org/skills-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/skills-kit/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

---

## Why skills-kit?

**Stop rewriting the same AI tools for every LLM provider.**

If you're building with AI, you've hit this wall: Claude skills don't work with OpenAI. OpenAI functions don't work with Gemini. Every time you switch providers or support multiple LLMs, you rewrite everything.

**skills-kit solves this.**

Write your skill once in a universal format, then generate platform-specific integrations automatically. It's like having a "compiler" for AI capabilities - write once, deploy everywhere.

### The Problem

- Teams waste weeks rewriting the same tool for different LLMs
- No standard way to test AI skills before production
- Security is an afterthought (no sandboxing, no policy enforcement)
- Vendor lock-in prevents you from switching providers
- No ecosystem for sharing AI capabilities

### The Solution

skills-kit provides:

- **Universal skill format** - One standard that works everywhere
- **Multi-platform bundling** - Auto-generate OpenAI, Gemini, Claude, or generic integrations
- **Built-in testing** - Golden tests ensure correctness before deployment
- **Security by default** - Policy enforcement prevents unsafe operations
- **AI-powered creation** - Generate skills from natural language using Claude

---

## Key Features

### 🚀 Write Once, Run Anywhere

Create a skill in the universal format, then bundle it for any LLM platform:

```bash
skills-kit bundle ./my-skill --target openai
skills-kit bundle ./my-skill --target gemini
skills-kit bundle ./my-skill --target claude
```

Each bundle includes platform-specific integration code, schemas, and usage examples.

### 🤖 AI-Powered Skill Generation

Describe what you want in natural language, and Claude AI generates a complete, working skill:

```bash
skills-kit create "Validate email addresses and return detailed info" --out ./email-validator
```

Generated skills include:
- Complete implementation (scripts/run.cjs)
- Input/output schemas (SKILL.md)
- Security policies (policy.yaml)
- Test cases (tests/golden.json)

### 🧪 Test-Driven Development

Golden tests ensure your skills work correctly:

```bash
skills-kit test ./my-skill
```

Tests are deterministic JSON input/output pairs - no flaky tests, no surprises in production.

### 🔒 Security First

Every skill has a security policy that defines what it can access:

```yaml
network: false
fs_read: []
fs_write: []
exec_allowlist: []
domains_allowlist: []
```

The runner enforces these policies at execution time, preventing:
- Path traversal attacks
- Unauthorized network access
- Arbitrary command execution
- Data exfiltration

### 📦 Universal Format

Every skill is a simple directory structure:

```
my-skill/
├── SKILL.md           # Manifest with YAML frontmatter
├── policy.yaml        # Security policy
├── scripts/
│   └── run.cjs       # Entrypoint (JSON in → JSON out)
└── tests/
    └── golden.json   # Test cases
```

### 🎯 Cross-Platform Adapters

Bundle generates runtime-specific integration files:

| Platform | Status | Generated Files |
|----------|--------|----------------|
| **OpenAI** | ✅ Ready | `tool.json`, `system_prompt.txt`, `usage.md` |
| **Gemini** | ✅ Ready | `function.json`, `system_instruction.txt`, `usage.md` |
| **Claude** | ✅ Ready | `notes.md` (native format) |
| **Generic** | ✅ Ready | `README.md` (universal integration) |

Each adapter includes working code examples in Python and JavaScript.

---

## 📦 Quick Start

### Installation

```bash
npm install -g @skills-kit/cli
```

### Check Your Setup

```bash
skills-kit doctor
```

This verifies your Node.js version and checks that all dependencies are working.

### Set Your API Key

To use AI-powered skill creation, you need an Anthropic API key:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Get your key from [console.anthropic.com](https://console.anthropic.com/)

### Create Your First Skill

```bash
skills-kit create "Parse CSV files and detect anomalies" --out ./csv-parser
```

This generates a complete, working skill with tests included.

### Test It

```bash
skills-kit test ./csv-parser
```

### Run It

```bash
echo '{"csv": "id,value\n1,100\n2,999"}' | skills-kit run ./csv-parser
```

### Bundle for Production

```bash
# Generate OpenAI integration
skills-kit bundle ./csv-parser --target openai

# Generate Gemini integration
skills-kit bundle ./csv-parser --target gemini

# Generate Claude integration
skills-kit bundle ./csv-parser --target claude
```

Each bundle is a `.zip` file containing the skill + platform-specific adapter files.

---

## Create a Skill

### Using AI (Recommended)

The fastest way to create a skill is using Claude AI:

```bash
skills-kit create "Your skill description here" --out ./my-skill
```

**Example descriptions:**

```bash
# Email validation
skills-kit create "Validate email addresses and return detailed validation info" --out ./email-validator

# Data transformation
skills-kit create "Convert JSON to YAML with syntax validation" --out ./json-to-yaml

# Text processing
skills-kit create "Extract URLs from text and check if they're accessible" --out ./url-extractor
```

Claude will generate:
1. A complete implementation
2. Input/output schemas
3. Security policies
4. Test cases

The system automatically runs tests and validation, then repairs any issues (usually 0-2 iterations).

### Manual Creation

You can also create skills manually using a starter template:

```bash
skills-kit init ./my-skill
```

This creates the basic directory structure. You'll need to:

1. Edit `SKILL.md` to define inputs/outputs
2. Write `scripts/run.cjs` (your implementation)
3. Configure `policy.yaml` (security settings)
4. Add test cases to `tests/golden.json`

### Skill Structure

Here's what a complete skill looks like:

**SKILL.md** (Manifest)
```markdown
---
name: email-validator
version: 1.0.0
description: Validate email addresses and return detailed info
entrypoints:
  - scripts/run.cjs
inputs:
  type: object
  properties:
    email:
      type: string
      description: Email address to validate
  required:
    - email
outputs:
  type: object
  properties:
    valid:
      type: boolean
    domain:
      type: string
    message:
      type: string
---

# Email Validator

Validates email addresses using RFC 5322 standards and checks domain format.
```

**scripts/run.cjs** (Implementation)
```javascript
#!/usr/bin/env node

// Read JSON input from stdin
const chunks = [];
process.stdin.on('data', chunk => chunks.push(chunk));
process.stdin.on('end', () => {
  const input = JSON.parse(Buffer.concat(chunks).toString());

  // Your logic here
  const result = validateEmail(input.email);

  // Write JSON output to stdout
  console.log(JSON.stringify(result));
});

function validateEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const valid = regex.test(email);
  const domain = valid ? email.split('@')[1] : null;

  return {
    valid,
    domain,
    message: valid ? 'Valid email' : 'Invalid email format'
  };
}
```

**policy.yaml** (Security)
```yaml
network: false
fs_read: []
fs_write: []
exec_allowlist: []
domains_allowlist: []
```

**tests/golden.json** (Tests)
```json
[
  {
    "name": "valid-email",
    "input": {"email": "test@example.com"},
    "expected": {
      "valid": true,
      "domain": "example.com",
      "message": "Valid email"
    }
  },
  {
    "name": "invalid-email",
    "input": {"email": "not-an-email"},
    "expected": {
      "valid": false,
      "domain": null,
      "message": "Invalid email format"
    }
  }
]
```

---

## Use

### Running Skills Locally

Execute a skill with JSON input:

```bash
# Using stdin
echo '{"email": "test@example.com"}' | skills-kit run ./email-validator

# Using input file
skills-kit run ./email-validator --input data.json

# Using inline JSON
skills-kit run ./email-validator --json '{"email": "test@example.com"}'
```

### Testing Skills

Run the golden test suite:

```bash
skills-kit test ./email-validator
```

This executes all test cases defined in `tests/golden.json` and reports:
- ✅ Number of tests passed
- ❌ Detailed failure messages for any failures

### Linting Skills

Validate skill structure and configuration:

```bash
skills-kit lint ./email-validator
```

The linter checks:
- SKILL.md frontmatter is valid YAML
- Required files exist (entrypoint, policy, tests)
- Policy is properly formatted
- Test cases have required fields
- Paths are safe (no traversal, no absolute paths)

### Bundling for Platforms

Generate platform-specific bundles:

```bash
# OpenAI bundle (includes tool.json, system_prompt.txt, usage.md)
skills-kit bundle ./email-validator --target openai

# Gemini bundle (includes function.json, system_instruction.txt, usage.md)
skills-kit bundle ./email-validator --target gemini

# Claude bundle (includes notes.md with integration instructions)
skills-kit bundle ./email-validator --target claude

# Generic bundle (includes universal README)
skills-kit bundle ./email-validator --target generic
```

Each bundle is a `.zip` file in the skill directory. Extract and explore:

```bash
unzip -l ./email-validator/email-validator-openai.zip
```

### Refining Existing Skills

Use AI to modify an existing skill:

```bash
skills-kit refine ./email-validator "Add support for validating multiple emails at once"
```

Claude will update the skill based on your request, run tests, and repair any issues.

### Integrating into Your Application

After bundling, follow the platform-specific usage guide:

**OpenAI (Python)**
```python
import openai
import json

# Load the tool definition
with open('adapters/openai/tool.json') as f:
    tool_def = json.load(f)

# Use in chat completion
response = openai.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Validate test@example.com"}],
    tools=[tool_def],
    tool_choice="auto"
)
```

**Gemini (JavaScript)**
```javascript
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';

// Load function declaration
const functionDef = JSON.parse(
  fs.readFileSync('adapters/gemini/function.json', 'utf8')
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: 'gemini-pro',
  tools: [{ functionDeclarations: [functionDef] }]
});
```

Full integration examples are included in each bundle's `usage.md` file.

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────┐
│         Developer writes skill (once)       │
└──────────────────┬──────────────────────────┘
                   │
         ┌─────────▼─────────┐
         │   Universal Format │
         │                    │
         │   SKILL.md        │  ← Manifest
         │   policy.yaml     │  ← Security
         │   scripts/run.cjs │  ← Logic
         │   tests/golden.json│  ← Tests
         └─────────┬─────────┘
                   │
    ┌──────────────┼──────────────┬──────────┐
    │              │              │          │
┌───▼────┐    ┌───▼────┐    ┌───▼────┐ ┌──▼──────┐
│ OpenAI │    │ Gemini │    │ Claude │ │ Generic │
│ Bundle │    │ Bundle │    │ Bundle │ │ Bundle  │
└────────┘    └────────┘    └────────┘ └─────────┘
     │             │             │           │
     ▼             ▼             ▼           ▼
Production   Production   Production   Any Runtime
```

### Package Structure

skills-kit is a TypeScript monorepo with 4 packages:

```
packages/
├── core/          # Skill parsing, linting, bundling, testing
├── runner/        # Skill execution with policy enforcement
├── agent/         # AI-powered skill generation (Claude integration)
└── cli/           # Command-line interface
```

**@skills-kit/core**
- Parses SKILL.md frontmatter and markdown
- Validates skill structure (linting)
- Generates platform adapters (OpenAI, Gemini, Claude, generic)
- Runs golden tests
- Bundles skills into distributable .zip files

**@skills-kit/runner**
- Executes skills in a sandboxed environment
- Enforces security policies (filesystem, network, exec)
- Prevents path traversal attacks
- Provides JSON stdin/stdout interface

**@skills-kit/agent**
- Claude API integration
- Generates skills from natural language
- Repairs skills based on lint/test failures
- Uses iterative refinement (typically 0-2 iterations)

**@skills-kit/cli**
- User-facing command-line tool
- Commands: init, create, refine, test, run, lint, bundle, doctor
- Colorized output with chalk
- Comprehensive error messages

### Skill Format

Every skill follows this structure:

```
skill-name/
├── SKILL.md              # YAML frontmatter + markdown body
├── policy.yaml           # Security policy
├── scripts/
│   └── run.cjs          # Entrypoint (must exist)
├── tests/
│   └── golden.json      # Test cases
└── resources/           # Optional: static files
    └── templates/
```

**SKILL.md Frontmatter:**
```yaml
name: string              # kebab-case identifier
version: string           # semver (e.g., "1.0.0")
description: string       # What the skill does
entrypoints: string[]     # Must include "scripts/run.cjs"
inputs: JSONSchema        # Input schema
outputs: JSONSchema       # Output schema
authors: string[]         # Optional
capabilities: string[]    # Optional: ["network", "filesystem", etc.]
runtime_dependencies: string[] # Optional: ["playwright", "puppeteer"]
```

**Execution Contract:**
- Entrypoint receives JSON via stdin
- Entrypoint writes JSON result to stdout
- Exit code 0 = success, non-zero = failure
- All operations must be deterministic (no randomness, time, or network by default)

### Security Model

**Policy Enforcement:**

skills-kit implements best-effort sandboxing in Node.js:

1. **Path Validation** - All file paths are validated to prevent:
   - Directory traversal (`../`)
   - Absolute paths
   - Symlink attacks
   - Access outside allowed directories

2. **Network Control** - Policy defines if network access is allowed:
   ```yaml
   network: true
   domains_allowlist:
     - "api.example.com"
     - "cdn.example.com"
   ```

3. **Filesystem Restrictions** - Explicit read/write allowlists:
   ```yaml
   fs_read: ["resources/*"]
   fs_write: ["output/*"]
   ```

4. **Execution Control** - Allowlist for shell commands:
   ```yaml
   exec_allowlist: ["git", "npm"]
   ```

**Limitations:**

This is best-effort sandboxing. For production isolation, run skills in:
- Docker containers
- Firecracker VMs
- gVisor sandboxes
- Separate processes with restricted permissions

### Adapter System

When you run `skills-kit bundle`, the system generates platform-specific files:

**OpenAI Adapter:**
- `tool.json` - Function calling schema compatible with OpenAI's format
- `system_prompt.txt` - Instructions for when to invoke the tool
- `usage.md` - Python and JavaScript integration examples

**Gemini Adapter:**
- `function.json` - Function declaration compatible with Gemini's format
- `system_instruction.txt` - System instruction for the model
- `usage.md` - Python and JavaScript integration examples

**Claude Adapter:**
- `notes.md` - Integration instructions (Claude uses the native SKILL.md format)

**Generic Adapter:**
- `README.md` - Universal integration guide for any LLM runtime

All adapters include:
- The complete skill code
- Platform-specific schemas
- Working integration examples
- Security policy documentation

### AI Generation Pipeline

When you run `skills-kit create`:

1. **User provides natural language description**
   ```bash
   skills-kit create "Validate email addresses" --out ./validator
   ```

2. **Claude generates complete skill**
   - Analyzes requirements
   - Generates spec (name, description, inputs, outputs, policy)
   - Generates implementation (scripts/run.cjs)
   - Generates test cases (tests/golden.json)
   - Generates documentation (SKILL.md)

3. **Validation loop (auto-repair)**
   - Lint: Check structure and configuration
   - Test: Run golden tests
   - If failures: Claude repairs automatically
   - Repeat until success (max 5 iterations)

4. **Result**
   - Complete, working skill
   - All tests passing
   - Ready to use

Average generation time: 10-30 seconds
Average repair iterations: 0-2

---

## 🙏 Contributing

We welcome contributions from the community! Here's how you can help:

### Ways to Contribute

- **🐛 Report bugs** - [Open an issue](https://github.com/your-org/skills-kit/issues)
- **💡 Suggest features** - [Start a discussion](https://github.com/your-org/skills-kit/discussions)
- **📖 Improve docs** - Documentation PRs are always welcome
- **🔧 Submit code** - See development setup below
- **✨ Create skills** - Build and share interesting skills

### Development Setup

```bash
# Clone the repository
git clone https://github.com/your-org/skills-kit.git
cd skills-kit

# Install dependencies (requires pnpm)
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Run linter
pnpm lint

# Type check
pnpm typecheck
```

### Project Structure

```
skills-kit/
├── packages/
│   ├── core/        # Core skill functionality
│   ├── runner/      # Skill execution
│   ├── agent/       # AI generation
│   └── cli/         # Command-line interface
├── examples/        # Example skills
└── docs/           # Documentation
```

### Running the CLI Locally

```bash
# After building, link the CLI
cd packages/cli
npm link

# Now you can use it globally
skills-kit --help
```

Or run directly:

```bash
node packages/cli/dist/index.js --help
```

### Code Guidelines

- **TypeScript** - All code must be typed
- **ESM** - Use ES modules (import/export)
- **Tests** - Add tests for new features
- **Linting** - Code must pass `pnpm lint`
- **Formatting** - We use prettier (runs automatically)

### Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests
5. Run `pnpm build && pnpm test && pnpm lint`
6. Commit with clear messages
7. Push to your fork
8. Open a Pull Request

### Testing Your Changes

```bash
# Test all packages
pnpm test

# Test specific package
cd packages/core
pnpm test

# Watch mode during development
pnpm test --watch
```

### Adding New Adapters

To add support for a new LLM platform:

1. Create `packages/core/src/adapters/yourplatform.ts`
2. Implement generator functions:
   - `generateYourPlatformSchema()`
   - `generateYourPlatformPrompt()`
   - `generateYourPlatformUsageDoc()`
3. Add to `packages/core/src/bundle.ts`
4. Add tests
5. Update documentation

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

export function generateMistralUsageDoc(skill: ParsedSkill) {
  return `# ${skill.frontmatter.name} - Mistral Integration

...usage examples...
`;
}
```

### Need Help?

- Check existing [issues](https://github.com/your-org/skills-kit/issues)
- Join our [discussions](https://github.com/your-org/skills-kit/discussions)
- Read the [documentation](https://skills-kit.dev/docs)

---

## 🤝 Community & Support

### Get Help

- **Documentation** - [skills-kit.dev/docs](https://skills-kit.dev/docs)
- **GitHub Issues** - [Report bugs or request features](https://github.com/your-org/skills-kit/issues)
- **GitHub Discussions** - [Ask questions, share ideas](https://github.com/your-org/skills-kit/discussions)
- **Examples** - Check the `examples/` directory in this repo

### Stay Updated

- **Star this repo** - Get notified of new releases
- **Watch releases** - Stay informed about updates
- **Follow development** - Check the [changelog](CHANGELOG.md)

### Share Your Skills

Built something cool with skills-kit? We'd love to hear about it!

- Share in [GitHub Discussions](https://github.com/your-org/skills-kit/discussions)
- Tag us on social media
- Submit your skill as an example via PR

### Commercial Support

For enterprise use cases, we can provide:
- Custom skill development
- Private skill registries
- Dedicated support
- Training and consulting

Contact: [email@skills-kit.dev](mailto:email@skills-kit.dev)

---

## Contributors

Thanks to everyone who has contributed to skills-kit!

<!-- This section will be auto-generated by all-contributors bot -->
<!-- If you contribute, you'll be added here automatically -->

---

## 📜 License

MIT License - see [LICENSE](LICENSE) file for details.

Copyright (c) 2024 skills-kit contributors

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

---

## What's Next?

**Get started now:**

```bash
npm install -g @skills-kit/cli
export ANTHROPIC_API_KEY=sk-ant-...
skills-kit create "Your first skill" --out ./my-skill
```

**Join the ecosystem:**

- Build skills and share them
- Contribute to the core toolchain
- Help shape the future of portable AI capabilities

**We're making AI skills portable, testable, and secure.**

⭐ Star this repo if you believe in an open AI ecosystem
