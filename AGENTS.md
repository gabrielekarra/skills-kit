# skills-kit – Agent & Contributor Notes

Scope: entire repository.

## Dev basics
- Node 20+, pnpm.
- Workspace scripts:
  - `pnpm install`
  - `pnpm -r build`
  - `pnpm -r lint`
  - `pnpm -r test`

## Coding style
- TypeScript, ESM.
- Prefer small, pure functions.
- No network calls in tests.
- All filesystem writes must be path‑safe: never allow `..` escapes.

## Security model
- Skills are untrusted input.
- Default policy: network OFF, exec allowlist empty.
- CLI must validate and block path traversal.

## Adding new providers
- Implement `LLMProvider` in `packages/agent/src/providers/*`.
- Providers must not log secrets.
- Prefer returning `writes` JSON; unified diff patches are also supported.
