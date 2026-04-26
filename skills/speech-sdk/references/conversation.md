# Multi-Speaker Conversations

`generateConversation` produces a single stitched audio file from an array of turns with different voices. Use it for podcasts, interviews, dramatizations, AI agents — anywhere more than one voice speaks.

**Don't** loop over `generateSpeech` yourself. `generateConversation`:

- Picks the most efficient transport for the given turns automatically.
- RMS-normalizes the output so every conversation plays back at the same loudness.
- Returns a result identical in shape to `SpeechResult`, except every word in `timestamps` carries a `turnIndex` pointing back into the input `turns[]`.

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

- `turns` — required array of `{ voice, text, model?, providerOptions? }` entries
- `model` — applies to every turn (all-or-nothing with per-turn `model`)
- `providerOptions` — top-level; merged with per-turn provider options
- `apiKey`
- `gapMs` — silence between turns when stitched, default 300
- `maxConcurrency` — parallel turn requests when stitched, default 6
- `maxRetries` — per-turn retries, default 2
- `volumeDbfs` — target RMS loudness in dBFS (must be ≤ 0), default `-20`
- `abortSignal`, `headers`, `timestamps`, `timestampProvider`

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

## Volume Normalization

Every conversation is RMS-leveled to `volumeDbfs` (default `-20` dBFS, the podcast voice standard) so two conversations generated independently play back at the same loudness. Override with `volumeDbfs: -18` (must be ≤ 0) to retarget.

- Normalization is always on and cannot be disabled.
- A warning is surfaced when normalization can't be applied (e.g. the chosen provider/model can't expose decodable PCM/WAV) and the raw mix passes through.

## Result

The result has the same top-level shape as `SpeechResult` (`audio`, `metadata`, `providerMetadata`, `warnings`, `timestamps`). The differences:

- `metadata.provider` / `metadata.model` are comma-joined when turns span multiple providers/models.
- `providerMetadata.turns` carries per-turn metadata when the conversation is stitched.
- Every word in `timestamps` includes `turnIndex` pointing back into the input `turns[]`.

When the underlying transport renders all turns in one call, `turnIndex` is derived by text-matching the flat word stream against the input transcripts; if matching diverges, `ConversationTimestampAttributionError` is thrown rather than silently emitting wrong indices. When turns are rendered separately and stitched, `turnIndex` is exact by construction.

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
| `ApiError`                  | Per-turn 4xx. 5xx/network get retried up to `maxRetries`.                                    |

## When to Use Which

| Task                                     | API                                        |
| ---------------------------------------- | ------------------------------------------ |
| Single utterance                         | `generateSpeech`                           |
| Low-latency real-time playback           | `streamSpeech`                             |
| Two+ speakers, podcast, dialogue, agent  | `generateConversation` ← use this          |
| A for-loop of `generateSpeech` calls     | Stop — use `generateConversation`          |
