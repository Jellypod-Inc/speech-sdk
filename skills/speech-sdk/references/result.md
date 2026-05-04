# Speech Result

`generateSpeech` returns a `SpeechResult`. Top-level fields:

- `audio` — the generated audio file (`uint8Array`, lazy-computed `base64`, `mediaType`)
- `metadata` — call metadata (see below)
- `timestamps` — populated only when `timestamps: true` is passed (see `timestamps.md`)
- `providerMetadata` — populated only when the provider response payload includes extras
- `warnings` — surfaced unsupported-feature warnings; `undefined` when there are none

`generateConversation` returns a `ConversationResult`, which extends `SpeechResult` with:

- `metadata.perTurn` — array of per-turn `SpeechMetadata` on the local-stitch path; `undefined` on gateway and native-dialogue paths
- `timestamps[].turnIndex` — index into the input `turns[]` for each word

`streamSpeech` returns a `StreamSpeechResult` whose `audio` is a `ReadableStream<Uint8Array>` instead of a `GeneratedAudioFile`. See `streaming.md`.

Import the exact types from `@speech-sdk/core` / `@speech-sdk/core/types` when you need them — the source is authoritative.

## Metadata

`SpeechMetadata` carries:

- `latencyMs` — total wall time for the call (for `streamSpeech`, equals `ttfbMs`).
- `inputChars` — length of the input text (raw, before audio-tag stripping or pronunciation substitution).
- `audioDurationMs` — total audio duration in ms. Computed client-side via mediabunny for path consistency. On `streamSpeech`, only set if the provider reports it.
- `ttfbMs` — `streamSpeech` only: time to first byte of the response body.

`metadata` does not carry the provider id or model id — track those caller-side if you need to log them.

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

On the auto-chunking path, `providerMetadata` aggregates per-chunk metadata as `{ chunks: [...] }`. On the conversation stitch path, it's `{ turns: [...] }`.

## Warnings

Unsupported-feature warnings (e.g. stripped audio tags, attribution-confidence issues on conversation timestamps) surface here instead of throwing:

```ts
if (result.warnings) console.log(result.warnings)
```
