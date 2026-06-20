# Multi-Speaker Conversations

`generateConversation` produces a single stitched audio file from an array of turns with different voices. Use it for podcasts, interviews, dramatizations, AI agents — anywhere more than one voice speaks.

**Don't** loop over `generateSpeech` yourself. `generateConversation`:

- Picks the most efficient transport for the given turns automatically (gateway → native dialogue → local stitch).
- RMS-normalizes the output so every conversation plays back at the same loudness.
- Returns a result identical in shape to `SpeechResult`, except every word in `timestamps` carries a `turnIndex` pointing back into the input `turns[]`, and `metadata.perTurn` carries per-turn metadata on the stitch path.

## Import

```ts
import { generateConversation } from "@speech-sdk/core"
```

## Quick Start

```ts
const result = await generateConversation({
  model: "provider/model",
  turns: [
    { voice: "voice-a", text: "Welcome to the show." },
    { voice: "voice-b", text: "Thanks for having me!" },
    { voice: "voice-a", text: "Today we're covering TTS." },
  ],
})

result.audio.uint8Array
result.audio.mediaType
```

## Options

`generateConversation` accepts:

- `turns` — required array of `{ voice, text, model?, providerOptions?, speed? }` entries
- `model` — applies to every turn (all-or-nothing with per-turn `model`)
- `providerOptions` — top-level; merged with per-turn provider options
- `output` — `{ format: "wav" | "pcm" | "mp3", bitrate? }`
- `speed` — `0.75–1.5`, applies to the merged audio. Per-turn `speed` applies first, then top-level applies to the mix.
- `pronunciations` — `{ rules }`
- `maxInputChars` — override per-model chunk threshold (direct paths only)
- `maxConcurrency` — parallel turn requests when stitched, default 6
- `maxRetries` — per-turn retries, default 2
- `gapMs` — silence between turns when stitched, default 300
- `volumeDbfs` — target RMS loudness in dBFS (≤ 0), default `-20`
- `timestamps` — boolean, default `false`
- `apiKey`, `abortSignal`, `headers`

Model placement is all-or-nothing: set `options.model` (applied to every turn) or set `model` on every turn, but not both. Mixing is rejected with `ConversationInputError`.

Import the exact option / turn / result types from `@speech-sdk/core` / `@speech-sdk/core/types` when needed — the source is authoritative.

## Cross-Provider Mixing

Each turn can use a different provider/model:

```ts
await generateConversation({
  turns: [
    { model: "provider-a/model", voice: "voice-1", text: "Host here." },
    { model: "provider-b/model", voice: "voice-2", text: "Guest here." },
    { model: "provider-a/model", voice: "voice-1", text: "Back to me." },
  ],
})
```

All turns must dispatch the same way — every turn through the gateway (`"provider/model"` strings) or every turn through direct factories. Mixing the two throws `MixedDispatchError`.

## Volume Normalization

Every conversation is RMS-leveled to `volumeDbfs` (default `-20` dBFS, the podcast voice standard) so two conversations generated independently play back at the same loudness. Override with `volumeDbfs: -18` (must be ≤ 0) to retarget.

- Normalization is always on and cannot be disabled.
- A warning is surfaced when normalization can't be applied (e.g. the chosen provider/model can't expose decodable PCM/WAV) and the raw mix passes through.

## Long Native Dialogue (Automatic Splitting)

Native-dialogue providers cap how much text a single call can render (e.g. Gemini TTS shares a 32k-token window between input and generated audio). When a conversation exceeds the provider's per-call limit, `generateConversation` keeps the native multi-speaker rendering instead of failing: it partitions the turns into blocks at turn boundaries (each block under the limit and still satisfying the provider's unique-voice rule), renders each block as its own native-dialogue call **in parallel** (bounded by `maxConcurrency`), and RMS-normalizes + stitches the blocks into one file with `gapMs` between blocks.

- This is transparent — same call, same result shape. `gapMs` (default 300) applies only at block seams, not between every turn.
- If the conversation can't be split into voice-valid blocks (e.g. a single turn longer than the limit, or a long single-speaker run on a two-voice model), it falls back to the local-stitch path and surfaces a warning.
- Gateway turns are unaffected — the gateway server owns its own chunking.

## Per-Turn Speed

```ts
await generateConversation({
  turns: [
    { voice: "voice-a", text: "Slow intro.", speed: 0.9 },
    { voice: "voice-b", text: "Normal pace." },
    { voice: "voice-a", text: "Quick wrap.", speed: 1.15 },
  ],
})
```

Per-turn speed forces the local-stitch path (so each turn can be re-rendered independently). Top-level `speed` then applies to the merged audio. Both must fall in `0.75–1.5`.

## Result

The result has the same top-level shape as `SpeechResult` (`audio`, `metadata`, `providerMetadata`, `warnings`, `timestamps`). The differences:

- Every word in `timestamps` includes `turnIndex` pointing back into the input `turns[]`.
- `metadata.perTurn` is an array of per-turn `SpeechMetadata` entries on the local-stitch path; `undefined` on gateway and native-dialogue paths (no per-turn boundaries exist as separate provider calls).
- `providerMetadata` is passthrough-only — when stitched, it carries `{ turns: [...] }` aggregating each underlying call's provider metadata; on gateway and native dialogue paths it reflects whatever the wire returned.

When `timestamps: true` is requested, the SDK returns observed word timestamps for stitched and native-dialogue conversations when the provider/STT supplies word-level alignment. The attribution mechanism varies by path:

- **Stitched** — `turnIndex` is exact by construction (one call per turn). Turns whose underlying call returned no per-word alignment are filled proportionally; a warning identifies them.
- **Native dialogue** — `turnIndex` is derived via a tiered attribution ladder (validated silence-anchor → improved text-match → proportional over observed words). Lower tiers emit warnings. If the observed word stream is empty, `timestamps` is absent with a warning; the SDK does not fabricate word timestamps from caller text.
- **Gateway** — whatever the gateway response returns. The SDK is a thin REST wrapper here; if the wire returns no timestamps, the field is absent.

Inspect `result.warnings` for attribution-confidence diagnostics in production.

Use the top-level `timestampsToTurns` helper to collapse the flat per-word list into one entry per turn — see `references/timestamps.md`.

## Errors

From `@speech-sdk/core`:

| Error                       | When                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| `ConversationInputError`    | Invalid input (no turns, empty text, etc.)                                                   |
| `DialogueConstraintError`   | Provider/model can't satisfy the requested turns (e.g. too many voices)                      |
| `MixedDispatchError`        | Conversation mixes gateway (`provider/model` string) turns with direct-factory turns         |
| `StitchUnsupportedError`    | A provider/model can't expose decodable PCM/WAV, so turns can't be locally mixed             |
| `NoSpeechGeneratedError`    | Final concatenated audio is empty                                                            |
| `ApiError`                  | Per-turn 4xx (carries `turnIndex` on the stitch path). 5xx/429/network get retried up to `maxRetries`. |

## When to Use Which

| Task                                     | API                                        |
| ---------------------------------------- | ------------------------------------------ |
| Single utterance                         | `generateSpeech`                           |
| Low-latency real-time playback           | `streamSpeech`                             |
| Two+ speakers, podcast, dialogue, agent  | `generateConversation` ← use this          |
| A for-loop of `generateSpeech` calls     | Stop — use `generateConversation`          |
