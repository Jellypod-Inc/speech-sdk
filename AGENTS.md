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

**Gateway invariant:** when routing through `SpeechGatewayProvider`, the SDK is a thin REST wrapper. A call made via the SDK must be byte-equivalent to the same call made via `curl` against `api.speechgateway.com`. The SDK does not add behavior on the gateway path — no client-side recovery, no client-side enrichment, no synthesizing fields from caller input that weren't on the wire, no fallbacks. The gateway server owns its contract; the SDK is a transport. Any new feature must work identically whether the caller uses the SDK or hits the REST API directly.

**Adding a new provider:**
1. Create `src/providers/<name>/index.ts` with a `<Name>SpeechProvider` class implementing `SpeechProvider` and a `create<Name>()` factory.
2. Add subpath export in `package.json` under `exports`.
3. Register the provider in `aggregatedModels()` in `src/providers/gateway/index.ts` so its models are discoverable through the gateway path.
4. Implement `resolveOutputFormat(modelId, output)` so the SDK can request the user's chosen output format natively from the API. Return `{ providerOptions, expectedMediaType }` for each format the provider supports; for formats the provider can't produce natively, return options that yield a decodable wav/pcm so the SDK can convert via mediabunny. Return `undefined` for unknown model ids. The SDK never decodes compressed audio — providers must produce wav/pcm for any format the user requests that isn't natively available.
5. Implement `getStitchOptions(modelId)` so the conversation stitch path can request decodable wav/pcm regardless of user format preference (the stitch pipeline always operates on raw samples).

## Key Conventions

- ESM-only (`"type": "module"` in package.json); use `.js` extensions in imports
- TypeScript strict mode, target ES2022
- `providerOptions` are passed through to provider APIs untransformed
- Tests use vitest with globals enabled
- Run `pnpm fix` before committing to ensure formatting compliance

## Versioning & Releases

Follow semver. Prereleases use the canonical `0.N.M-alpha.K` form so they collapse cleanly into the corresponding stable `0.N.M`.

- **Stable**: `0.8.0`, `0.8.1`, `0.9.0`. Published to npm `latest`.
- **Prerelease**: `0.9.0-alpha.0`, `0.9.0-alpha.1`, … all pre-patches of the same target `0.9.0`. Published to npm `next`.
- When the next stable is cut, drop the suffix: `0.9.0-alpha.3` → `0.9.0`. Do **not** keep incrementing the minor/patch on the alpha track (e.g. `0.9.0-alpha`, `0.9.1-alpha`, `0.9.2-alpha`) — that creates phantom stable versions that never shipped and confuses npm's version ordering.
- Bump the alpha counter (`-alpha.K`), not the minor/patch, between prereleases of the same target.
- Breaking changes bump the minor while pre-1.0 (`0.8.0` → `0.9.0`); features alone can ride a patch on a stable line if no API changes.

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


# Ultracite Code Standards

This project uses **Ultracite**, a zero-config preset that enforces strict code quality standards through automated formatting and linting.

## Quick Reference

- **Format code**: `pnpm dlx ultracite fix`
- **Check for issues**: `pnpm dlx ultracite check`
- **Diagnose setup**: `pnpm dlx ultracite doctor`

Biome (the underlying engine) provides robust linting and formatting. Most issues are automatically fixable.

---

## Core Principles

Write code that is **accessible, performant, type-safe, and maintainable**. Focus on clarity and explicit intent over brevity.

### Type Safety & Explicitness

- Use explicit types for function parameters and return values when they enhance clarity
- Prefer `unknown` over `any` when the type is genuinely unknown
- Use const assertions (`as const`) for immutable values and literal types
- Leverage TypeScript's type narrowing instead of type assertions
- Use meaningful variable names instead of magic numbers - extract constants with descriptive names

### Modern JavaScript/TypeScript

- Use arrow functions for callbacks and short functions
- Prefer `for...of` loops over `.forEach()` and indexed `for` loops
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safer property access
- Prefer template literals over string concatenation
- Use destructuring for object and array assignments
- Use `const` by default, `let` only when reassignment is needed, never `var`

### Async & Promises

- Always `await` promises in async functions - don't forget to use the return value
- Use `async/await` syntax instead of promise chains for better readability
- Handle errors appropriately in async code with try-catch blocks
- Don't use async functions as Promise executors

### React & JSX

- Use function components over class components
- Call hooks at the top level only, never conditionally
- Specify all dependencies in hook dependency arrays correctly
- Use the `key` prop for elements in iterables (prefer unique IDs over array indices)
- Nest children between opening and closing tags instead of passing as props
- Don't define components inside other components
- Use semantic HTML and ARIA attributes for accessibility:
  - Provide meaningful alt text for images
  - Use proper heading hierarchy
  - Add labels for form inputs
  - Include keyboard event handlers alongside mouse events
  - Use semantic elements (`<button>`, `<nav>`, etc.) instead of divs with roles

### Error Handling & Debugging

- Remove `console.log`, `debugger`, and `alert` statements from production code
- Throw `Error` objects with descriptive messages, not strings or other values
- Use `try-catch` blocks meaningfully - don't catch errors just to rethrow them
- Prefer early returns over nested conditionals for error cases

### Code Organization

- Keep functions focused and under reasonable cognitive complexity limits
- Extract complex conditions into well-named boolean variables
- Use early returns to reduce nesting
- Prefer simple conditionals over nested ternary operators
- Group related code together and separate concerns

### Security

- Add `rel="noopener"` when using `target="_blank"` on links
- Avoid `dangerouslySetInnerHTML` unless absolutely necessary
- Don't use `eval()` or assign directly to `document.cookie`
- Validate and sanitize user input

### Performance

- Avoid spread syntax in accumulators within loops
- Use top-level regex literals instead of creating them in loops
- Prefer specific imports over namespace imports
- Avoid barrel files (index files that re-export everything)
- Use proper image components (e.g., Next.js `<Image>`) over `<img>` tags

### Framework-Specific Guidance

**Next.js:**
- Use Next.js `<Image>` component for images
- Use `next/head` or App Router metadata API for head elements
- Use Server Components for async data fetching instead of async Client Components

**React 19+:**
- Use ref as a prop instead of `React.forwardRef`

**Solid/Svelte/Vue/Qwik:**
- Use `class` and `for` attributes (not `className` or `htmlFor`)

---

## Testing

- Write assertions inside `it()` or `test()` blocks
- Avoid done callbacks in async tests - use async/await instead
- Don't use `.only` or `.skip` in committed code
- Keep test suites reasonably flat - avoid excessive `describe` nesting

## When Biome Can't Help

Biome's linter will catch most issues automatically. Focus your attention on:

1. **Business logic correctness** - Biome can't validate your algorithms
2. **Meaningful naming** - Use descriptive names for functions, variables, and types
3. **Architecture decisions** - Component structure, data flow, and API design
4. **Edge cases** - Handle boundary conditions and error states
5. **User experience** - Accessibility, performance, and usability considerations
6. **Documentation** - Add comments for complex logic, but prefer self-documenting code

---

Most formatting and common issues are automatically fixed by Biome. Run `pnpm dlx ultracite fix` before committing to ensure compliance.
