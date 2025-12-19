# MCP Agent Example

This example demonstrates how to use skills created with skills-kit via the MCP protocol using the [mcp-use](https://github.com/mcp-use/mcp-use) library.

## Prerequisites

- Python 3.10+
- skills-kit CLI installed
- At least one skill created with skills-kit

## Setup

1. **Install dependencies:**

```bash
cd examples/mcp-agent
pip install -r requirements.txt
```

2. **Configure environment:**

```bash
cp .env.example .env
# Edit .env with your API keys
```

3. **Start the skills-kit MCP server:**

```bash
# In another terminal, serve your skills
skills-kit serve ./path/to/your/skills --port 3000
```

## Usage

### Interactive Mode

```bash
python agent.py
```

This starts an interactive chat where you can ask the agent to use your skills.

### Single Prompt Mode

```bash
python agent.py "Use my-skill to process this data"
```

### Choose Provider

```bash
# Use Anthropic (default)
python agent.py --provider anthropic "Your prompt"

# Use OpenAI
python agent.py --provider openai "Your prompt"
```

### Custom Server URL

```bash
python agent.py --server-url http://localhost:8080/sse "Your prompt"
```

## Example Session

```
$ skills-kit serve ./demo-skill --port 3000
# Server running...

$ python agent.py
Skills-Kit MCP Agent (Interactive Mode)
========================================
Provider: anthropic
Type 'quit' or 'exit' to stop

You: What skills are available?

Agent: I can see the following skills available:
- demo-skill: A demo skill that echoes input

You: Use demo-skill with input "hello world"

Agent: I called demo-skill with your input. The result was:
{"ok": true, "output": "hello world"}

You: quit
Goodbye!
```

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│   Agent     │────▶│  MCP Client │────▶│ skills-kit      │
│ (mcp-use)   │     │  (SSE/stdio)│     │ MCP Server      │
└─────────────┘     └─────────────┘     └────────┬────────┘
       │                                         │
       │                                         ▼
       │                                ┌─────────────────┐
       │                                │   Your Skills   │
       ▼                                │ - skill-1       │
┌─────────────┐                         │ - skill-2       │
│    LLM      │                         │ - ...           │
│ (Anthropic/ │                         └─────────────────┘
│   OpenAI)   │
└─────────────┘
```

## Configuration Options

### Via Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Anthropic API key | - |
| `OPENAI_API_KEY` | OpenAI API key | - |
| `ANTHROPIC_MODEL` | Anthropic model | `claude-sonnet-4-20250514` |
| `OPENAI_MODEL` | OpenAI model | `gpt-4o` |
| `MCP_SERVER_URL` | MCP server URL | `http://localhost:3000/sse` |

### Via Command Line

| Option | Description |
|--------|-------------|
| `--provider` | LLM provider (`anthropic` or `openai`) |
| `--server-url` | MCP server URL |

## Connecting via stdio

If you prefer stdio transport instead of SSE, modify the agent config:

```python
config = {
    "mcpServers": {
        "skills": {
            "command": "skills-kit",
            "args": ["serve", "./path/to/skills", "--transport", "stdio"]
        }
    }
}
```

## Learn More

- [mcp-use Documentation](https://github.com/mcp-use/mcp-use)
- [skills-kit Documentation](../../README.md)
- [Model Context Protocol](https://modelcontextprotocol.io)
