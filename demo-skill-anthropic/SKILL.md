---
name: playwright-smoketest
description: Skill che fa smoke test con Playwright e salva screenshot su fail
version: 0.1.0
authors: ["skills-kit"]
allowed_tools: []
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
---

Mocked Playwright login smoketest. Deterministic and portable.
