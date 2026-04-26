# Word-Level Timestamps

`generateSpeech` and `generateConversation` return word-level alignment alongside the audio when timestamps are enabled and the selected route provides them. Timings are word granularity; `start` / `end` are seconds from the start of the generated audio.

## Quick Start

```ts
import { generateSpeech } from "@speech-sdk/core"

const result = await generateSpeech({
  model: "provider/model",
  text: "Hello from speech-sdk!",
  voice: "voice-id",
  timestamps: "on",
})

result.timestamps
// [
//   { text: "Hello",  start: 0.00, end: 0.32 },
//   { text: "from",   start: 0.36, end: 0.55 },
//   ...
// ]
```

## Modes

- `"on"` — always return timestamps. Native alignment when the provider supplies it; STT fallback otherwise.
- `"off"` *(default)* — never return timestamps.

`result.timestamps` is always populated when mode is `"on"` — the cascade resolves transparently.

## Cascade

When `timestamps: "on"`, the SDK resolves alignment in this order:

1. **Native** — provider returns alignment directly in its TTS response.
2. **User override `timestampProvider`** — a resolved STT model (constructed via `.stt(...)` on a provider factory). Use this to route to a cheaper or in-house STT.
3. **Default STT fallback** — uses the SDK's built-in default. Requires the corresponding env var, else throws `TimestampKeyMissingError`.

## Per-Provider Support

Native alignment is a per-model capability and the set of models with native alignment evolves. See each `providers/<name>.md` reference for which of that provider's models carry native alignment. Models without it go through the STT fallback.

You can also check at runtime by inspecting the model info exposed on the provider — look for a `timestamps` feature with `mode: "native"`.

## Custom STT Provider

To use a different STT key or model, configure `fallbackSTT` on the factory by constructing a resolved STT model via `.stt(...)` on a provider factory from `@speech-sdk/core/providers`:

```ts
import { generateSpeech } from "@speech-sdk/core"
import { createProviderA, createProviderB } from "@speech-sdk/core/providers"

const a = createProviderA({
  fallbackSTT: createProviderB({ apiKey: process.env.MY_STT_KEY }).stt("stt-model-id"),
})

await generateSpeech({
  model: a("tts-model-id"),
  text: "...",
  voice: "voice-id",
  timestamps: "on",
})
```

For a fully custom STT provider, implement the SDK's STT provider interface and pass the resolved model directly via the `timestampProvider` option on `generateSpeech` / `generateConversation`. Import the relevant interfaces from `@speech-sdk/core` / `@speech-sdk/core/types`.

## Conversations

`generateConversation` accepts the same `timestamps` and `timestampProvider` options and returns a flat list of words across all turns. Each word carries a `turnIndex` — the index into the input `turns[]` array that produced it. Existing callers reading `.text / .start / .end` keep working; new callers can attribute every word to its source turn.

When the underlying transport renders all turns in one call, `turnIndex` is derived by text-matching the provider's flat word stream against the input transcripts. If matching diverges (the provider inserts, drops, or reorders words), `ConversationTimestampAttributionError` is thrown rather than silently emitting wrong indices.

When turns are rendered separately and stitched, `turnIndex` is exact by construction and word timings are offset by cumulative turn duration plus inter-turn gap.

```ts
const result = await generateConversation({
  turns: [
    { model: "provider-a/model", voice: "voice-1", text: "Hi!" },
    { model: "provider-b/model", voice: "voice-2", text: "Hey!" },
  ],
  timestamps: "on",
})

result.timestamps // monotonic across both turns, each entry has turnIndex
```

### Collapsing flat timestamps into per-turn timings

The common UI pattern is to reduce the flat per-word list into one entry per turn — start / end / combined text — to drive chat-bubble UIs or speaker-attributed captions. Use the top-level `timestampsToTurns` helper:

```ts
import { generateConversation, timestampsToTurns } from "@speech-sdk/core"

const turns = [
  { voice: "voice-1", text: "Hi there." },
  { voice: "voice-2", text: "Hello!" },
]

const result = await generateConversation({
  model: "provider/model",
  turns,
  timestamps: "on",
})

const turnTimestamps = timestampsToTurns(result.timestamps ?? [])
// [
//   { turnIndex: 0, start: 0.00, end: 0.42, text: "Hi there." },
//   { turnIndex: 1, start: 0.72, end: 1.05, text: "Hello!" },
// ]
```

To attach the speaking voice (or anything else from the input turns), look it up by `turnIndex`:

```ts
const annotated = turnTimestamps.map((t) => ({ ...t, voice: turns[t.turnIndex].voice }))
```

Natural input for chat-bubble UIs, speaker-attributed captions, or karaoke-style highlighting during playback.

## Errors

| Error                                | When                                                                 |
| ------------------------------------ | -------------------------------------------------------------------- |
| `TimestampKeyMissingError`           | STT fallback triggered but no key is configured — message names the env var |
| `GatewayTimestampsUnavailableError`  | A `provider/model` string `timestamps: "on"` request returned without alignment |
| `ConversationTimestampAttributionError` | Provider's flat word stream couldn't be unambiguously attributed to input turns |

Other errors (`ApiError`, etc.) propagate from the underlying STT call on the derived path.

## Debugging

Set `DEBUG=speech-sdk` (or `DEBUG=*`) to log the timestamp routing decision — whether the native path was requested, which STT provider the `"on"` fallback will target, and the word counts returned.
