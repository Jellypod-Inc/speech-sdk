# Multi-Speaker Conversations

`generateConversation` produces a single stitched audio file from an array of turns with different voices. Use it for podcasts, interviews, dramatizations, AI agents — anywhere more than one voice speaks.

**Don't** loop over `generateSpeech` yourself. `generateConversation`:

- Routes to a **fast path** when every turn uses the same `provider/model` string and a string voice (one HTTP call for the whole conversation).
- Otherwise routes to a provider's **native multi-speaker endpoint** when one exists (ElevenLabs request-stitching, Fish Audio dialogue, Hume dialogue, Gemini multi-speaker, etc.).
- Otherwise runs turns in parallel and concatenates the decoded PCM locally with a configurable gap.
- **RMS-normalizes the output** so every conversation plays back at the same loudness.
- Returns a `ConversationResult`, identical in shape to `SpeechResult` except `timestamps` is `ConversationWordTimestamp[]` (adds `turnIndex`).

## Import

```ts
import { generateConversation } from "@speech-sdk/core"
import type {
  ConversationTurn,
  GenerateConversationOptions,
} from "@speech-sdk/core/types"
```

## Quick Start

```ts
const result = await generateConversation({
  model: "openai/gpt-4o-mini-tts",
  turns: [
    { voice: "alloy", text: "Welcome to the show." },
    { voice: "echo",  text: "Thanks for having me!" },
    { voice: "alloy", text: "Today we're covering TTS." },
  ],
})

result.audio.uint8Array
result.audio.mediaType // "audio/wav" when stitched/normalized
```

## Options

```ts
interface GenerateConversationOptions {
  turns: ConversationTurn[]           // required
  model?: string | ResolvedModel      // default for turns that don't specify one
  providerOptions?: object            // top-level; merged with per-turn
  apiKey?: string
  gapMs?: number                      // silence between turns (stitch path), default 300
  maxConcurrency?: number             // parallel turn requests (stitch path), default 6
  maxRetries?: number                 // per-turn retries, default 2
  normalizeVolume?: boolean           // RMS-level output, default true
  volumeDbfs?: number                 // target loudness, default -20
  abortSignal?: AbortSignal
  headers?: Record<string, string>
}

interface ConversationTurn {
  voice: Voice
  text: string
  model?: string | ResolvedModel      // override per turn
  providerOptions?: object            // merged over top-level
}
```

## Cross-Provider Mixing

Each turn can use a different provider/model:

```ts
await generateConversation({
  turns: [
    { model: "openai/gpt-4o-mini-tts",          voice: "alloy",                text: "Host here." },
    { model: "elevenlabs/eleven_multilingual_v2", voice: "EXAVITQu4vr4xnSDxMaL", text: "Guest here." },
    { model: "openai/gpt-4o-mini-tts",          voice: "alloy",                text: "Back to me." },
  ],
})
```

Mixed-provider conversations always take the stitch path.

## Dispatch: Fast, Native, Stitch

SpeechSDK picks automatically from three paths:

- **Fast path** — every turn uses the same `provider/model` string and a string voice. One HTTP request handles the whole conversation. Voice clones (`{url}` / `{audio}`) drop to stitch.
- **Native** — one direct provider with `generateDialogue`, and the turns fit its `dialogueCapabilities` (`minVoices` / `maxVoices`). Provider returns a fully mixed file.
- **Stitch** — everything else. Turns render in parallel via `generateSpeech`, forced into PCM/WAV via `getStitchOptions`, then concatenated with `gapMs` silence. Throws `StitchUnsupportedError` if any model can't expose a decodable PCM/WAV mode.

## Volume Normalization

`normalizeVolume: true` (default) RMS-levels the stitched or native-dialogue output to `volumeDbfs` (default `-20` dBFS, the podcast voice standard). Two conversations generated independently can be played back-to-back without listener volume adjustments.

- Skipped if set to `false`.
- On the native path, only applied when the provider exposes `getStitchOptions` (a decodable PCM/WAV mode). If it doesn't, a warning is surfaced and the raw provider mix passes through.
- On the stitch path, always applied.

## Result

Shape is `ConversationResult`, identical to `SpeechResult` except `timestamps` is narrowed to `ConversationWordTimestamp[]`:

```ts
interface ConversationResult extends Omit<SpeechResult, "timestamps"> {
  audio: GeneratedAudioFile,         // concatenated / mixed audio
  metadata: {
    latencyMs, inputChars,
    provider,                        // comma-joined when multi-provider
    model,
    audioDurationMs?,
  },
  providerMetadata?: {
    turns: [...]                     // per-turn metadata on stitch path
  } | ProviderNativeMetadata,
  timestamps?: readonly ConversationWordTimestamp[],
  warnings?: string[],
}

interface ConversationWordTimestamp extends WordTimestamp {
  turnIndex: number   // index into the input turns[] array
}
```

Every word carries a `turnIndex` pointing back into the input `turns[]`. On the stitch path the index is exact (each turn renders separately and timestamps are offset by cumulative duration + gap). On the fast and native-dialogue paths the index is derived by text-matching the flat word stream against the input transcripts; if matching diverges on the native path, `ConversationTimestampAttributionError` is thrown rather than silently emitting wrong indices. See `references/timestamps.md` for the worked aggregation example that collapses flat timestamps into per-turn spans.

## Errors

From `@speech-sdk/core`:

| Error                       | When                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| `ConversationInputError`    | Invalid input (no turns, empty text, etc.)                                                   |
| `DialogueConstraintError`   | Native path selected but provider can't satisfy turns (e.g. too many voices)                 |
| `StitchUnsupportedError`    | Stitch path selected but a provider/model doesn't expose PCM/WAV — can't be locally mixed    |

Also thrown (imported from `@speech-sdk/core`):

- `NoSpeechGeneratedError` — final concatenated audio is empty
- `ApiError` — per-turn 4xx. 5xx/network get retried up to `maxRetries`.

## When to Use Which

| Task                                     | API                                        |
| ---------------------------------------- | ------------------------------------------ |
| Single utterance                         | `generateSpeech`                           |
| Low-latency real-time playback           | `streamSpeech`                             |
| Two+ speakers, podcast, dialogue, agent  | `generateConversation` ← use this          |
| A for-loop of `generateSpeech` calls     | Stop — use `generateConversation`          |
