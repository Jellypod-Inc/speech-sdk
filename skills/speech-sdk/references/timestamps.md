# Word-Level Timestamps

`generateSpeech` and `generateConversation` can return word-level alignment alongside the audio. Timings are word granularity, `start` / `end` in seconds from the start of the generated audio.

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
type TimestampMode = "on" | "auto" | "off"
```

| Mode     | Behavior                                                                                              |
| -------- | ----------------------------------------------------------------------------------------------------- |
| `"auto"` *(default)* | Return timestamps only if the TTS provider supplies them natively. No extra API calls.   |
| `"on"`   | Always return timestamps. Uses native alignment when available; otherwise falls back to STT.         |
| `"off"`  | Never return timestamps, even when the provider would return them for free.                          |

## Cascade

When `timestamps` is `"on"` or `"auto"` (and the provider is native-capable), the SDK resolves timestamps in this order:

1. **Native** — provider returns alignment directly in its TTS response (e.g. ElevenLabs `/with-timestamps`).
2. **User override `timestampProvider`** — custom STT model (`"provider/model"` string or `ResolvedSTTModel`). Use this to route to a cheaper in-house Whisper or a gateway.
3. **Default STT fallback** — OpenAI Whisper (`openai/whisper-1`). Requires `OPENAI_API_KEY` (or `timestampApiKey`), else throws `TimestampKeyMissingError`.

## Native vs Derived Capability

Models declare their timestamp capability as a feature:

```ts
import { getFeature, type TimestampsFeature } from "@speech-sdk/core"

const feat = getFeature<TimestampsFeature>(modelInfo, "timestamps")
// { id: "timestamps", mode: "native" }   → alignment in the TTS response
// { id: "timestamps", mode: "derived" }  → SDK pipes audio through STT on "on"
// undefined                              → no declared capability; STT fallback handles "on"
```

As of v0.7: ElevenLabs declares `native` (via `/with-timestamps`); OpenAI declares `derived`. Other providers work on the `"on"` path via the default Whisper fallback even without an explicit declaration.

## Custom STT Provider

Override the STT target used on the derived path:

```ts
await generateSpeech({
  model: "cartesia/sonic-3",
  text: "...",
  voice: "voice-id",
  timestamps: "on",
  timestampProvider: "openai/whisper-1",    // or a ResolvedSTTModel
  timestampApiKey: process.env.MY_WHISPER_KEY,
})
```

For a fully custom provider, implement `SpeechToTextProvider` and pass a `ResolvedSTTModel`:

```ts
import type { SpeechToTextProvider, ResolvedSTTModel } from "@speech-sdk/core"

const myProvider: SpeechToTextProvider = { /* ... */ }
const resolved: ResolvedSTTModel = { provider: myProvider, modelId: "whisper-ish" }

await generateSpeech({ ..., timestamps: "on", timestampProvider: resolved })
```

The STT subpath export `@speech-sdk/core/stt/openai` is also available if you want to reuse the built-in OpenAI STT provider directly.

## Conversations

`generateConversation` accepts the same `timestamps` / `timestampProvider` / `timestampApiKey` options and returns a single flat `WordTimestamp[]` across all turns.

- **Stitch path** — each turn's word timings are offset by the cumulative turn duration + gap. Monotonic across turn boundaries. Works cross-provider (each turn gets native alignment when available, else STT).
- **Native dialogue path** — the provider renders everything in one call; the mixed audio yields a flat list **without speaker labels** (a limitation of one-shot dialogue rendering). `timestamps: "on"` without native dialogue alignment transcribes the mix via STT.

```ts
const result = await generateConversation({
  turns: [
    { model: "openai/gpt-4o-mini-tts",            voice: "alloy",                text: "Hi!" },
    { model: "elevenlabs/eleven_multilingual_v2", voice: "JBFqnCBsd6RMkjVDRZzb", text: "Hey!" },
  ],
  timestamps: "on",
})

result.timestamps // monotonic word timings across both turns
```

## Types

```ts
interface WordTimestamp {
  readonly text: string
  readonly start: number   // seconds
  readonly end: number     // seconds
}
```

Exported from `@speech-sdk/core`:

- `TimestampMode`, `WordTimestamp`
- `TimestampsFeature`, `FEATURES.TIMESTAMPS`, `getFeature`, `hasFeature`
- `SpeechToTextProvider`, `STTModelInfo`, `ResolvedSTTModel`, `resolveSTTModel`
- `TimestampKeyMissingError` (from the base `errors` export)

## Errors

| Error                       | When                                                                 |
| --------------------------- | -------------------------------------------------------------------- |
| `TimestampKeyMissingError`  | `timestamps: "on"` triggers the STT fallback but no key is configured — message names the env var |

Other errors (`ApiError`, etc.) propagate from the underlying STT call on the derived path.

## Debugging

Set `DEBUG=speech-sdk` (or `DEBUG=*`) to log the timestamp routing decision — whether the native path was requested, which STT provider the `"on"` fallback will target, and the word counts returned.
