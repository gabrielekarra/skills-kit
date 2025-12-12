---
name: playwright-smoketest
description: Simulated Playwright login smoketest with screenshot on failure.
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
---

This skill demonstrates a login → dashboard smoketest.  
In this repo it is **mocked** (no real browser) but keeps Claude‑compatible structure.
