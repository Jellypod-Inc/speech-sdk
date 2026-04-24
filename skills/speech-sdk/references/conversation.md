# Multi-Speaker Conversations

`generateConversation` produces a single stitched audio file from an array of turns with different voices. Use it for podcasts, interviews, dramatizations, AI agents — anywhere more than one voice speaks.

**Don't** loop over `generateSpeech` yourself. `generateConversation`:

- Routes to the **Speech Gateway fast-path** when every turn uses the same gateway-routed string model (one HTTP call, server renders + stitches + normalizes).
- Otherwise routes to a provider's **native multi-speaker endpoint** when one exists (ElevenLabs request-stitching, Fish Audio dialogue, Hume dialogue, Gemini multi-speaker, etc.).
- Otherwise runs turns in parallel and concatenates the decoded PCM locally with a configurable gap.
- **RMS-normalizes the output** so every conversation plays back at the same loudness.
- Returns a `ConversationResult`, identical in shape to `SpeechResult` except `timestamps` is `ConversationWordTimestamp[]` (adds `turnIndex`).

## Import

```ts
import { generateConversation } from "@speech-sdk/core/conversation"
import type {
  ConversationTurn,
  GenerateConversationOptions,
} from "@speech-sdk/core/conversation"
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

## Dispatch: Gateway, Native, Stitch

SpeechSDK picks automatically from three paths:

- **Gateway fast-path** — every turn uses the same gateway-routed string model (e.g. `"elevenlabs/eleven_v3"`) and every turn uses a string voice (not a voice clone). The SDK sends one HTTP request to `api.speechgateway.com` and the server handles rendering, per-turn stitching, gap insertion, and RMS normalization. Faster than local stitch — no per-turn round trips, no audio-mux code in the client bundle. Allow-by-default for any gateway-routed model. Voice clones (`{url}` / `{audio}` voice shapes) always fall through to the stitch path, because the gateway endpoint doesn't ingest reference audio inline.
- **Native** — one direct provider, supports `generateDialogue`, and turn voices/count satisfy that provider's `dialogueCapabilities` (e.g. `minVoices`, `maxVoices`). Provider returns a fully-mixed file.
- **Stitch** — everything else: mixed providers, voice clones on otherwise gateway-routable models, or a single provider with no dialogue endpoint. Turns run in parallel via `generateSpeech`, each forced into a PCM/WAV mode (`getStitchOptions`), then concatenated with `gapMs` silence. Requires every model to expose a decodable PCM/WAV mode — otherwise `StitchUnsupportedError` is thrown.

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

Every word carries a `turnIndex` pointing back into the input `turns[]`. On the stitch path the index is exact (each turn renders separately and timestamps are offset by cumulative duration + gap). On the gateway and native-dialogue paths the index is attributed by the server / derived by text-matching the provider's flat timestamps against the input transcripts; if matching diverges on the native path, `ConversationTimestampAttributionError` is thrown rather than silently emitting wrong indices. See `references/timestamps.md` for the worked aggregation example that collapses flat timestamps into per-turn spans.

## Errors

From `@speech-sdk/core/conversation/errors`:

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
