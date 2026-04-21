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

When `timestamps` is `"on"`, the SDK resolves timestamps in this order. (`"auto"` returns native timestamps only — it never triggers STT; if the provider has no native alignment, `timestamps` is `undefined` on the result.)

1. **Native** — provider returns alignment directly in its TTS response (e.g. ElevenLabs `/with-timestamps`).
2. **User override `timestampProvider`** — a `ResolvedSTTModel` constructed via a factory. Use this to route to a cheaper in-house Whisper or a gateway.
3. **Default STT fallback** — OpenAI Whisper (`openai/whisper-1`). Requires `OPENAI_API_KEY`, else throws `TimestampKeyMissingError`.

## Per-Provider Support

As of v0.7, only one provider returns word alignment natively in its TTS response:

- **ElevenLabs** — `eleven_v3`, `eleven_multilingual_v2`, `eleven_flash_v2`, `eleven_flash_v2_5` return alignment via `/with-timestamps`. `timestamps: "auto"` gets it for free.

Every other provider is audio-only today. `timestamps: "auto"` returns `undefined`; `timestamps: "on"` routes through the default `timestampProvider` (OpenAI Whisper `openai/whisper-1`) or the caller's override, which transcribes the synthesized audio.

Check a specific model at runtime:

```ts
import { getFeature, type TimestampsFeature } from "@speech-sdk/core"

const feat = getFeature<TimestampsFeature>(modelInfo, "timestamps")
// { id: "timestamps", mode: "native" } → alignment in the TTS response
// otherwise                            → STT fallback on "on", undefined on "auto"
```

## Custom STT Provider

`timestampProvider` accepts a `ResolvedSTTModel`. Construct one via a factory — the built-in OpenAI STT factory lives at the `@speech-sdk/core/stt/openai` subpath:

```ts
import { generateSpeech } from "@speech-sdk/core"
import { createOpenAISTT } from "@speech-sdk/core/stt/openai"

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

`generateConversation` accepts the same `timestamps` and `timestampProvider` options and returns a single flat `WordTimestamp[]` across all turns.

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
- `SpeechToTextProvider`, `STTModelInfo`, `ResolvedSTTModel`
- `TimestampKeyMissingError`

From `@speech-sdk/core/stt/openai`:

- `createOpenAISTT`, `OpenAISpeechToTextProvider`

## Errors

| Error                       | When                                                                 |
| --------------------------- | -------------------------------------------------------------------- |
| `TimestampKeyMissingError`  | `timestamps: "on"` triggers the STT fallback but no key is configured — message names the env var |

Other errors (`ApiError`, etc.) propagate from the underlying STT call on the derived path.

## Debugging

Set `DEBUG=speech-sdk` (or `DEBUG=*`) to log the timestamp routing decision — whether the native path was requested, which STT provider the `"on"` fallback will target, and the word counts returned.
