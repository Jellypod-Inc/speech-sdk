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
- `src/resolve-provider.ts` — parses `"provider/model"` strings, instantiates built-in providers; add new providers here in `createBuiltinProvider()`
- `src/speech-provider.ts` — `SpeechProvider` interface all providers implement
- `src/speech-result.ts` — `DefaultGeneratedAudioFile` with lazy base64 conversion
- `src/provider-utils.ts` — shared `resolveApiKey()` and `handleErrorResponse()`
- `src/providers/openai/` and `src/providers/elevenlabs/` — provider implementations

**Adding a new provider:**
1. Create `src/providers/<name>/<name>-speech-model.ts` implementing `SpeechProvider`
2. Create `src/providers/<name>/<name>-provider.ts` with a `create<Name>()` factory
3. Add a case to `createBuiltinProvider()` in `resolve-provider.ts`
4. Add subpath export in `package.json` under `exports`

**Provider pattern:** Each provider has a factory function (`createOpenAI`, `createElevenLabs`) that returns a function which produces a `ResolvedModel`. String models like `"openai/tts-1"` resolve API keys from env vars (`OPENAI_API_KEY`, `ELEVENLABS_API_KEY`).

## Key Conventions

- ESM-only (`"type": "module"` in package.json); use `.js` extensions in imports
- TypeScript strict mode, target ES2022
- Zero runtime dependencies besides `p-retry`
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

### Error Handling

- Throw `Error` objects with descriptive messages, not strings
- Prefer early returns over nested conditionals
- Don't catch errors just to rethrow them

### Testing

- Write assertions inside `it()` or `test()` blocks
- Use async/await, not done callbacks
- Don't commit `.only` or `.skip`
