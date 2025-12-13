---
name: api-contract-checker
description: Validates API responses against OpenAPI/JSON schema contracts
version: 0.1.0
authors: ["skills-kit"]
allowed_tools: []
entrypoints:
  - scripts/run.cjs
inputs:
  type: object
  properties:
    response: { type: object }
    schema: { type: object }
outputs:
  type: object
  properties:
    valid: { type: boolean }
    errors: { type: array }
    warnings: { type: array }
capabilities: []
targets: ["claude", "openai", "generic"]
---

# API Contract Checker

Cross-LLM portable skill for validating API responses against schemas.

## Why this skill?

When building integrations or testing APIs, you need to ensure responses match expected contracts. This skill:

- Validates response structure against JSON schemas
- Detects missing/extra fields
- Checks type mismatches
- Works offline (no network required)
- Portable across any LLM runtime

## Usage

```bash
echo '{"response": {"id": 123}, "schema": {"type": "object", "properties": {"id": {"type": "number"}}}}' | skills-kit run .
```

## Cross-LLM Demo

This skill demonstrates portability:
- Works with Claude via skills-kit
- Works with OpenAI via adapters/openai/tool.json
- Works standalone via generic bundle
