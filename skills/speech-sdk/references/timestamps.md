# Word-Level Timestamps

`generateSpeech` and `generateConversation` return word-level alignment alongside the audio when timestamps are enabled and the selected route provides them. Timings are word granularity, `start` / `end` in seconds from the start of the generated audio.

## Quick Start

```ts
import { generateSpeech } from "@speech-sdk/core"

const result = await generateSpeech({
  model: "elevenlabs/eleven_multilingual_v2",
  text: "Hello from speech-sdk!",
  voice: "JBFqnCBsd6RMkjVDRZzb",
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

```ts
type TimestampMode = "on" | "off"
```

| Mode     | Behavior                                                                                              |
| -------- | ----------------------------------------------------------------------------------------------------- |
| `"on"`   | Always return timestamps. Native alignment when the provider supplies it, STT fallback otherwise.     |
| `"off"` *(default)* | Never return timestamps. |

## Cascade

When `timestamps: "on"`, the SDK resolves alignment in this order:

1. **Native** — provider returns alignment directly in its TTS response (e.g. ElevenLabs `/with-timestamps`).
2. **User override `timestampProvider`** — a `ResolvedSTTModel` constructed via a factory. Use this to route to a cheaper in-house Whisper.
3. **Default STT fallback** — OpenAI Whisper (`openai/whisper-1`). Requires `OPENAI_API_KEY`, else throws `TimestampKeyMissingError`.

`result.timestamps` is always populated when mode is `"on"` — the cascade resolves transparently.

## Per-Provider Support

Native alignment is a per-model capability. The set of models with native alignment evolves — see each `providers/<name>.md` reference for which of that provider's models carry it. Models without native alignment go through the STT fallback.

Check a specific model's public metadata at runtime:

```ts
import type { TimestampsFeature } from "@speech-sdk/core/types"

const feat = modelInfo.features.find(
  (f): f is TimestampsFeature => typeof f !== "string" && f.id === "timestamps",
)
// { id: "timestamps", mode: "native" } → alignment in the TTS response
// otherwise                            → STT fallback when timestamps: "on"
```

## Custom STT Provider

`timestampProvider` accepts a `ResolvedSTTModel`. Construct one via a factory from `@speech-sdk/core/providers`:

```ts
import { generateSpeech } from "@speech-sdk/core"
import { createOpenAISTT } from "@speech-sdk/core/providers"

const whisper = createOpenAISTT({ apiKey: process.env.MY_WHISPER_KEY })

await generateSpeech({
  model: "cartesia/sonic-3",
  text: "...",
  voice: "voice-id",
  timestamps: "on",
  timestampProvider: whisper("whisper-1"),
})
```

For a fully custom provider, implement `SpeechToTextProvider` and pass the resolved model directly:

```ts
import type { SpeechToTextProvider, ResolvedSTTModel } from "@speech-sdk/core"

const myProvider: SpeechToTextProvider = { /* ... */ }
const resolved: ResolvedSTTModel = { provider: myProvider, modelId: "whisper-ish" }

await generateSpeech({ /* ... */ timestamps: "on", timestampProvider: resolved })
```

## Conversations

`generateConversation` accepts the same `timestamps` and `timestampProvider` options and returns a flat `ConversationWordTimestamp[]` across all turns. `ConversationWordTimestamp` extends `WordTimestamp` with a required `turnIndex: number` — the index into the input `turns[]` array that produced that word. Existing callers reading `.text / .start / .end` keep working; new callers can attribute every word to its source turn.

- **Stitch path** — each turn renders separately; `turnIndex` is exact by construction and word timings are offset by cumulative turn duration + gap. Works cross-provider (each turn gets native alignment when available, else STT).
- **Native dialogue path** — the provider renders every turn in one call; `turnIndex` is derived by text-matching the provider's flat word stream against the input transcripts. If matching diverges (the provider inserts, drops, or reorders words), `ConversationTimestampAttributionError` is thrown rather than silently emitting wrong indices.
- **Fast path** — when every turn uses the same `provider/model` string and a string voice, one HTTP request handles the whole conversation. `turnIndex` is derived by STT over the mixed audio plus text-matching against the input turns.

`turnIndex` is why conversation timestamps are a different type from `generateSpeech`'s `WordTimestamp[]`. It is what lets you build chat-bubble UIs, speaker-attributed transcripts, and "who's speaking now?" lookups during playback — without re-deriving turn boundaries from `gapMs` and per-turn durations.

```ts
const result = await generateConversation({
  turns: [
    { model: "openai/gpt-4o-mini-tts",            voice: "alloy",                text: "Hi!" },
    { model: "elevenlabs/eleven_multilingual_v2", voice: "JBFqnCBsd6RMkjVDRZzb", text: "Hey!" },
  ],
  timestamps: "on",
})

result.timestamps // ConversationWordTimestamp[] — monotonic across both turns, each with turnIndex
```

### Collapsing flat timestamps into per-turn timings

The common UI pattern is to reduce the flat per-word list into one entry per turn — the start / end / combined text of each turn — so you can drive chat-bubble UIs or speaker-attributed captions. Use the top-level `timestampsToTurns` helper:

```ts
import { generateConversation, timestampsToTurns } from "@speech-sdk/core"

const turns = [
  { voice: "rachel", text: "Hi there." },
  { voice: "adam",   text: "Hello!" },
]

const result = await generateConversation({
  model: "elevenlabs/eleven_v3",
  turns,
  timestamps: "on",
})

const turnTimestamps = timestampsToTurns(result.timestamps ?? [])
// [
//   { turnIndex: 0, start: 0.00, end: 0.42, text: "Hi there." },
//   { turnIndex: 1, start: 0.72, end: 1.05, text: "Hello!" },
// ]
```

Each entry covers one turn's worth of words. To attach the speaking voice (or anything else from the input turns), look it up by `turnIndex` against the `turns[]` you passed in:

```ts
const annotated = turnTimestamps.map((t) => ({ ...t, voice: turns[t.turnIndex].voice }))
```

Natural input for chat-bubble UIs, speaker-attributed captions, or karaoke-style highlighting during playback. Import `TurnTimestamp` from `@speech-sdk/core/types` if you need the return type.

## Types

```ts
interface WordTimestamp {
  readonly text: string
  readonly start: number   // seconds
  readonly end: number     // seconds
}

// Returned by generateConversation — extends WordTimestamp with turnIndex
interface ConversationWordTimestamp extends WordTimestamp {
  readonly turnIndex: number   // index into the input turns[] array
}
```

Types are exported from `@speech-sdk/core/types`:

- `TimestampMode`, `WordTimestamp`, `ConversationWordTimestamp`, `TurnTimestamp`
- `TimestampsFeature`
- `SpeechToTextProvider`, `STTModelInfo`, `ResolvedSTTModel`

Errors are exported from `@speech-sdk/core`:

- `TimestampKeyMissingError`, `ConversationTimestampAttributionError`
- `GatewayTimestampsUnavailableError`

From `@speech-sdk/core/providers`:

- `createOpenAISTT`

## Errors

| Error                       | When                                                                 |
| --------------------------- | -------------------------------------------------------------------- |
| `TimestampKeyMissingError`  | `timestamps: "on"` triggers the STT fallback but no key is configured — message names the env var |
| `GatewayTimestampsUnavailableError` | A `provider/model` string `timestamps: "on"` request returned without alignment |

Other errors (`ApiError`, etc.) propagate from the underlying STT call on the derived path.

## Debugging

Set `DEBUG=speech-sdk` (or `DEBUG=*`) to log the timestamp routing decision — whether the native path was requested, which STT provider the `"on"` fallback will target, and the word counts returned.
