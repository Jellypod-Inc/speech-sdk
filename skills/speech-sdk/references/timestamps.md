# Word-Level Timestamps

`generateSpeech` and `generateConversation` return word-level alignment alongside the audio when timestamps are enabled and the selected route provides them. Timings are word granularity; `start` / `end` are seconds from the start of the generated audio.

## Quick Start

```ts
import { generateSpeech } from "@speech-sdk/core"

const result = await generateSpeech({
  model: "provider/model",
  text: "Hello from speech-sdk!",
  voice: "voice-id",
  timestamps: true,
})

result.timestamps
// [
//   { text: "Hello",  start: 0.00, end: 0.32 },
//   { text: "from",   start: 0.36, end: 0.55 },
//   ...
// ]
```

## Modes

`timestamps` is a boolean.

- `true` — return timestamps. Native alignment when the provider supplies it; STT fallback otherwise (direct path only).
- `false` *(default)* — never return timestamps; no STT round-trip is attempted.

`result.timestamps` is populated when `timestamps: true` and the underlying transport surfaces alignment. On gateway-routed calls the SDK is a thin REST wrapper — if the wire response lacks timestamps, `result.timestamps` is `undefined` rather than thrown.

## Cascade

When `timestamps: true`, the SDK resolves alignment in this order:

1. **Native** — provider returns alignment directly in its TTS response (or, for the gateway, the wire payload includes `timestamps`).
2. **Configured fallback STT** — if the resolved factory has `fallbackSTT` set, that STT model transcribes the synthesized audio. Direct path only.
3. **Default STT fallback** — `createOpenAI().stt("whisper-1")` is loaded lazily and used. Requires `OPENAI_API_KEY`, else throws `TimestampKeyMissingError` naming the env var.

Gateway-routed calls never run a client-side STT round-trip — alignment is whatever the gateway returns.

## Per-Provider Support

Native alignment is a per-model capability and the set of models with native alignment evolves. See each `providers/<name>.md` reference for which of that provider's models carry native alignment. Models without it go through the STT fallback (direct path).

You can also check at runtime by inspecting `provider.models` — look for the string `"timestamps"` in a model's `features` array.

## Custom STT Provider

To use a different STT key or model, set `fallbackSTT` on the TTS factory by constructing a resolved STT model via `.stt(...)` on a provider factory:

```ts
import { generateSpeech } from "@speech-sdk/core"
import { createElevenLabs, createOpenAI } from "@speech-sdk/core/providers"

const elevenlabs = createElevenLabs({
  apiKey: process.env.ELEVENLABS_API_KEY,
  fallbackSTT: createOpenAI({ apiKey: process.env.MY_STT_KEY }).stt("whisper-1"),
})

await generateSpeech({
  model: elevenlabs("eleven_flash_v2"),
  text: "...",
  voice: "voice-id",
  timestamps: true,
})
```

There is no per-call `timestampProvider` option — `fallbackSTT` is the only override mechanism, and it lives on the TTS factory config. To use an STT provider that the SDK doesn't ship, implement the `SpeechToTextProvider` interface (see `@speech-sdk/core/types`) and pass a `ResolvedSTTModel` you construct yourself as `fallbackSTT`.

## Conversations

`generateConversation` accepts the same boolean `timestamps` option and returns a flat list of words across all turns. Each word carries a `turnIndex` — the index into the input `turns[]` array that produced it.

When the underlying transport renders all turns in one call (native dialogue or gateway), `turnIndex` is derived via a tiered attribution ladder (validated silence-anchor → improved text-match → proportional over observed words). Lower tiers emit warnings on `result.warnings`; the SDK does not fabricate word timestamps from caller text when the observed word stream is empty.

When turns are rendered separately and stitched, `turnIndex` is exact by construction and word timings are offset by cumulative turn duration plus inter-turn gap. Turns whose underlying call returned no per-word alignment are filled proportionally, with a warning identifying them.

```ts
const result = await generateConversation({
  turns: [
    { model: "provider-a/model", voice: "voice-1", text: "Hi!" },
    { model: "provider-b/model", voice: "voice-2", text: "Hey!" },
  ],
  timestamps: true,
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
  timestamps: true,
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

## Captions

Use `timestampsToCaptions` to format word timestamps as SRT or VTT:

```ts
import { generateSpeech, timestampsToCaptions } from "@speech-sdk/core"

const result = await generateSpeech({ ..., timestamps: true })
const srt = timestampsToCaptions(result.timestamps ?? [], { format: "srt" })
const vtt = timestampsToCaptions(result.timestamps ?? [], { format: "vtt" })
```

## Speed

When `speed` is non-1, timestamps are scaled inversely (`start / speed`, `end / speed`) so they line up with the post-stretch audio. No caller action required.

## Pronunciations

When `pronunciations.rules` substitute words before synthesis, returned timestamps reference the **original** input text — the SDK inverse-aligns each word back through the substitution map.

## Errors

| Error                                | When                                                                 |
| ------------------------------------ | -------------------------------------------------------------------- |
| `TimestampKeyMissingError`           | STT fallback triggered but no key is configured — message names the env var (e.g. `OPENAI_API_KEY` for the default Whisper fallback) |

Other errors (`ApiError`, etc.) propagate from the underlying STT call on the derived path.

## Debugging

Set `DEBUG=speech-sdk` (or `DEBUG=*`) to log the timestamp routing decision — whether the native path was requested, which STT provider the fallback will target, and the word counts returned.
