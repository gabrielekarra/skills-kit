---
name: playwright-smoketest
description: Login flow validation with deterministic testing
version: 0.1.0
authors: ["skills-kit"]
allowed_tools: ["exec"]
entrypoints:
  - scripts/run.cjs
inputs:
  type: object
  properties:
    url: { type: string }
    username: { type: string }
    password: { type: string }
outputs:
  type: object
  properties:
    ok: { type: boolean }
    steps: { type: array }
    screenshotPath: { type: string }
capabilities: ["fs.read", "exec"]
targets: ["claude", "openai", "generic"]
---

# Playwright Smoketest

Production-ready login flow validation skill. Demonstrates:
- Structured input/output schemas
- Golden test coverage
- Policy-based security
- Cross-platform portability

This implementation uses a deterministic simulation for CI/testing. Replace with real Playwright code for production browser automation.
