# Speech SDK

This file provides guidance when working with code in this repository.

## Commands

```bash
pnpm install              # install dependencies
pnpm build                # compile TypeScript (tsc)
pnpm test                 # run unit tests
pnpm test -- -t "test name"  # run a single test by name
pnpm run test:e2e         # run e2e tests (requires OPENAI_API_KEY / ELEVENLABS_API_KEY)
pnpm run typecheck        # type-check without emitting
pnpm fix                  # format/lint via ultracite (biome)
pnpm check                # check for lint issues
```

E2E tests hit real provider APIs and require keys in `.env` or exported in shell. Unit tests are in `src/__tests__/*.test.ts`, e2e tests in `src/__tests__/e2e/*.e2e.test.ts`.

## Architecture

This is `@speech-sdk/core` — a universal TTS SDK (Node, Edge, Browser) with a single public function `generateSpeech()` and a provider abstraction for multi-provider support.

**Core flow:** `generateSpeech()` → `resolveModel()` → `provider.generate()` → `SpeechResult`

- `src/generate-speech.ts` — the public API entry point; handles retry logic via `p-retry`
- `src/resolve-provider.ts` — bare `"provider/model"` strings resolve to the gateway provider; `ResolvedModel` instances pass through unchanged
- `src/providers/gateway/index.ts` — `SpeechGatewayProvider` + `createSpeechGateway()`; proxies inline-mode requests to `api.speechgateway.com`. Aggregates every built-in provider's `models[]` under namespaced ids (`openai/tts-1`) so capability checks work through the gateway
- `src/speech-provider.ts` — `SpeechProvider` interface all providers implement
- `src/speech-result.ts` — `DefaultGeneratedAudioFile` with lazy base64 conversion
- `src/provider-utils.ts` — shared `resolveApiKey()` and `handleErrorResponse()`
- `src/providers/openai/` and `src/providers/elevenlabs/` — provider implementations

**Two paths to a provider** (chosen by how the caller passes `model`):
- String (`"openai/tts-1"`) → routes through `SpeechGatewayProvider`; needs `SPEECH_GATEWAY_API_KEY`.
- Factory (`createOpenAI()("tts-1")`) → calls the provider directly; reads the per-provider env var (`OPENAI_API_KEY`) unless an explicit `apiKey` is passed to the factory.

**Adding a new provider:**
1. Create `src/providers/<name>/index.ts` with a `<Name>SpeechProvider` class implementing `SpeechProvider` and a `create<Name>()` factory.
2. Add subpath export in `package.json` under `exports`.
3. Register the provider in `aggregatedModels()` in `src/providers/gateway/index.ts` so its models are discoverable through the gateway path.

## Key Conventions

- ESM-only (`"type": "module"` in package.json); use `.js` extensions in imports
- TypeScript strict mode, target ES2022
- `providerOptions` are passed through to provider APIs untransformed
- Tests use vitest with globals enabled
- Run `pnpm fix` before committing to ensure formatting compliance

## Code Standards

Formatting and linting enforced by Biome via ultracite. Husky pre-commit hook runs tests and lint automatically.

### TypeScript

- Prefer `unknown` over `any`
- Use const assertions (`as const`) for immutable values
- Leverage type narrowing instead of type assertions
- Use `const` by default, `let` only when needed, never `var`
- Use `async/await` over promise chains
- Prefer `for...of` over `.forEach()`

### Comments

- Default to no comments. Add one only when the WHY is non-obvious — a hidden constraint, a subtle invariant, a workaround, or a spec/RFC reference
- Single-line only. Never write multi-line `//` blocks or block comments outside of JSDoc on exported APIs
- Don't explain WHAT the code does — well-named identifiers already do that
- Don't reference the current task, PR, fix, or callers ("added for X", "used by Y") — that rots; put it in the PR description

### Error Handling

- Throw `Error` objects with descriptive messages, not strings
- Prefer early returns over nested conditionals
- Don't catch errors just to rethrow them

### Testing

- Write assertions inside `it()` or `test()` blocks
- Use async/await, not done callbacks
- Don't commit `.only` or `.skip`
