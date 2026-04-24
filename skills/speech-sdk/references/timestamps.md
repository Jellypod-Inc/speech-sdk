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
type TimestampMode = "on" | "auto" | "off"
```

| Mode     | Behavior                                                                                              |
| -------- | ----------------------------------------------------------------------------------------------------- |
| `"auto"` *(default)* | Gateway decides whether to return timestamps; direct providers return native timestamps only. |
| `"on"`   | Gateway must return timestamps for string models. Direct providers use native alignment or STT fallback. |
| `"off"`  | Never return timestamps, even when the provider would return them for free.                          |

## Speech Gateway Behavior

String models route through Speech Gateway. The SDK picks the endpoint based on the requested mode — the wire body carries no `timestamps` field.

- `generateSpeech` with `timestamps: "auto"` or `"on"` → `POST /v1/audio/speech/with-timestamps` (JSON envelope: `{ audio, mediaType, warnings, timestamps }`).
- `generateSpeech` with `timestamps: "off"` → `POST /v1/audio/speech` (raw bytes, streamed when the provider supports it).
- `generateConversation` with any mode → `POST /v1/audio/conversation` (raw mixed audio bytes). The endpoint does not carry word alignment on the wire today; a `/v1/audio/conversation/with-timestamps` variant is pending server-side support for per-turn attribution.

For `generateSpeech`, all timestamp work happens on the gateway — the SDK does not run a client-side STT fallback. If the response is missing timestamps, `timestamps: "on"` throws `GatewayTimestampsUnavailableError` and `"auto"` returns without them.

For `generateConversation`, `timestamps: "on"` runs STT locally over the mixed audio and attributes words back to turns via text-matching; `"auto"` returns without timestamps. When the gateway ships `/v1/audio/conversation/with-timestamps` the SDK will hit that endpoint and this local path goes away.

Use `isSpeechGatewayModel(resolved)` for gateway-specific timestamp branches:

```ts
if (isSpeechGatewayModel(resolved)) {
  // Gateway routing — see rules above.
}
```

## Direct Provider Cascade

For factory-created direct provider models, when `timestamps` is `"on"`, the SDK resolves timestamps in this order. (`"auto"` returns native timestamps only — it never triggers STT; if the provider has no native alignment, `timestamps` is `undefined` on the result.)

1. **Native** — provider returns alignment directly in its TTS response (e.g. ElevenLabs `/with-timestamps`).
2. **User override `timestampProvider`** — a `ResolvedSTTModel` constructed via a factory. Use this to route to a cheaper in-house Whisper or a gateway.
3. **Default STT fallback** — OpenAI Whisper (`openai/whisper-1`). Requires `OPENAI_API_KEY`, else throws `TimestampKeyMissingError`.

## Per-Provider Support

Direct provider support varies by model:

- **ElevenLabs** — `eleven_v3`, `eleven_multilingual_v2`, `eleven_flash_v2`, `eleven_flash_v2_5` return alignment via `/with-timestamps`. `timestamps: "auto"` gets it for free.

Providers without native alignment are audio-only on the direct path. `timestamps: "auto"` returns `undefined`; `timestamps: "on"` routes through the default `timestampProvider` (OpenAI Whisper `openai/whisper-1`) or the caller's override, which transcribes the synthesized audio. This STT fallback does not run for `generateSpeech` through the Speech Gateway (the gateway handles it server-side), but it does run for gateway-routed `generateConversation` with `timestamps: "on"` until `/v1/audio/conversation/with-timestamps` ships.

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

`generateConversation` accepts the same `timestamps` and `timestampProvider` options and returns a flat `ConversationWordTimestamp[]` across all turns. `ConversationWordTimestamp` extends `WordTimestamp` with a required `turnIndex: number` — the index into the input `turns[]` array that produced that word. Existing callers reading `.text / .start / .end` keep working; new callers can attribute every word to its source turn.

- **Gateway fast-path** — when every turn uses the same gateway-routed string model, the server renders + stitches in one call and returns mixed audio. Per-word `turnIndex` is derived client-side today: STT over the mixed audio plus text-matching against the input turns. When `/v1/audio/conversation/with-timestamps` ships, `turnIndex` will come back on the response and the client-side step goes away.
- **Stitch path** — each turn's word timings are offset by the cumulative turn duration + gap. Monotonic across turn boundaries; `turnIndex` is exact by construction (each turn renders separately). Works cross-provider (each turn gets native alignment when available, else STT).
- **Native dialogue path** — the provider renders everything in one call; `turnIndex` is derived by text-matching the provider's flat word stream against the input transcripts. If matching diverges (the provider inserts, drops, or reorders words), `ConversationTimestampAttributionError` is thrown rather than silently emitting wrong indices.

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

### Collapsing flat timestamps into per-turn spans

The common UI pattern is to reduce the flat per-word list into one span per turn — the start / end / combined text of each turn — so you can drive chat-bubble UIs or speaker-attributed captions. Walk the list and merge consecutive words with the same `turnIndex`:

```ts
import { generateConversation, type ConversationWordTimestamp } from "@speech-sdk/core"

const result = await generateConversation({
  model: "elevenlabs/eleven_v3",
  turns: [
    { voice: "rachel", text: "Hi there." },
    { voice: "adam",   text: "Hello!" },
  ],
  timestamps: "on",
})

// result.timestamps is ConversationWordTimestamp[]:
//   { text, start, end, turnIndex }[]

function toTurnSpans(
  timestamps: readonly ConversationWordTimestamp[],
  turns: readonly { voice: string }[],
) {
  type Span = { turnIndex: number; voice: string; start: number; end: number; text: string }
  const spans: Span[] = []
  for (const word of timestamps) {
    const last = spans.at(-1)
    if (last?.turnIndex === word.turnIndex) {
      last.end = word.end
      last.text += " " + word.text
    } else {
      spans.push({
        turnIndex: word.turnIndex,
        voice: turns[word.turnIndex].voice,
        start: word.start,
        end: word.end,
        text: word.text,
      })
    }
  }
  return spans
}

// Each span: { voice, start, end, text } — answers
// "voice X plays from t=0.00 to t=0.42, voice Y from t=0.72 to t=1.05, ..."
// Natural input for chat-bubble UIs, speaker-attributed captions, or
// karaoke-style highlighting during playback.
```

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

Exported from `@speech-sdk/core`:

- `TimestampMode`, `WordTimestamp`, `ConversationWordTimestamp`
- `TimestampsFeature`, `FEATURES.TIMESTAMPS`, `getFeature`, `hasFeature`
- `SpeechToTextProvider`, `STTModelInfo`, `ResolvedSTTModel`
- `TimestampKeyMissingError`, `ConversationTimestampAttributionError`
- `GatewayTimestampsUnavailableError`, `isSpeechGatewayModel`

From `@speech-sdk/core/stt/openai`:

- `createOpenAISTT`, `OpenAISpeechToTextProvider`

## Errors

| Error                       | When                                                                 |
| --------------------------- | -------------------------------------------------------------------- |
| `TimestampKeyMissingError`  | Direct provider `timestamps: "on"` triggers the STT fallback but no key is configured — message names the env var |
| `GatewayTimestampsUnavailableError` | Gateway-routed `timestamps: "on"` response did not include word timestamps |

Other errors (`ApiError`, etc.) propagate from the underlying STT call on the derived path.

## Debugging

Set `DEBUG=speech-sdk` (or `DEBUG=*`) to log the timestamp routing decision — whether the native path was requested, which STT provider the `"on"` fallback will target, and the word counts returned.
