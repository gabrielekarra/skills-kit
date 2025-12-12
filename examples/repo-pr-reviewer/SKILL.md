---
name: repo-pr-reviewer
description: Produces a structured JSON review from a diff/patch.
version: 0.1.0
authors: ["skills-kit"]
allowed_tools: []
entrypoints:
  - scripts/run.cjs
inputs:
  type: object
  properties:
    diff: { type: string }
outputs:
  type: object
  properties:
    risks: { type: array }
    suggestions: { type: array }
    summary: { type: string }
---

Given a PR diff, this skill outputs a JSON review with risk flags and suggestions.  
The implementation here is deterministic and offline.
