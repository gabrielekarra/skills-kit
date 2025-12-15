---
name: test-echo
description: A simple echo skill for testing
version: 0.1.0
authors: ["skills-kit"]
allowed_tools: []
entrypoints:
  - scripts/run.cjs
inputs:
  message:
    type: string
    description: Message to echo back
    required: true
  count:
    type: number
    description: Number of times to repeat
    default: 1
  uppercase:
    type: boolean
    description: Convert to uppercase
    default: false
outputs:
  result:
    type: string
  repeated:
    type: number
---

A simple echo skill for testing the MCP server integration.
