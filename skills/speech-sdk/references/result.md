# Speech Result

`generateSpeech` returns a `SpeechResult`. Top-level fields:

- `audio` — the generated audio file (`uint8Array`, lazy-computed `base64`, `mediaType`)
- `metadata` — call metadata (latency, input chars, provider id, model id, etc.)
- `timestamps` — populated only when `timestamps: "on"` is passed (see `timestamps.md`)
- `providerMetadata` — populated only when the provider response payload includes extras
- `warnings` — surfaced unsupported-feature warnings; `undefined` when there are none

Import the exact types from `@speech-sdk/core` / `@speech-sdk/core/types` when you need them — the source is authoritative.

## Writing to a File (Node)

```ts
import { writeFileSync } from "fs"

const result = await generateSpeech({ ... })
writeFileSync("output.mp3", result.audio.uint8Array)
```

`base64` is lazy-computed from `uint8Array` on first access — no overhead if unused.

## Returning a Response (Edge/Server)

```ts
return new Response(result.audio.uint8Array, {
  headers: { "Content-Type": result.audio.mediaType },
})
```

## Playing in the Browser

```ts
const blob = new Blob([result.audio.uint8Array], { type: result.audio.mediaType })
new Audio(URL.createObjectURL(blob)).play()
```

## Provider Metadata

`providerMetadata` shape varies by provider. Some providers attach extras (continuation IDs, language detection, etc.) that you can read back. Inspect it at runtime, or check `providers/<name>.md` for what a given provider returns.

## Warnings

Unsupported-feature warnings (e.g. stripped audio tags) surface here instead of throwing:

```ts
if (result.warnings) console.log(result.warnings)
```
