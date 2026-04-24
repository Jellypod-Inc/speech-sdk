---
name: speech-sdk
description: "How to use @speech-sdk/core for text-to-speech and multi-speaker conversations across 13 providers (OpenAI, ElevenLabs, Deepgram, Cartesia, Hume, Google Gemini, Fish Audio, Inworld, Murf, Resemble, fal, Mistral, xAI). Use this skill whenever the user wants to generate speech audio, convert text to speech, stream TTS output, build a multi-speaker podcast or dialogue, get word-level timestamps / alignment for TTS, clone a voice, or integrate @speech-sdk/core. Also trigger on imports from '@speech-sdk/core' or its subpath exports."
---

# @speech-sdk/core

Universal TypeScript TTS SDK. One API. String models use Speech Gateway. Factory models call providers directly. Runs in Node, Edge, and Browser.

**Three top-level functions** — `generateSpeech` (single utterance), `streamSpeech` (chunked audio), `generateConversation` (multi-speaker dialogue).

## Install

```bash
npm install @speech-sdk/core
```

## Quick Start

```ts
import { generateSpeech } from "@speech-sdk/core"

const result = await generateSpeech({
  model: "openai/gpt-4o-mini-tts",
  text: "Hello from SpeechSDK!",
  voice: "alloy",
})

result.audio.uint8Array // Uint8Array — raw audio bytes
result.audio.base64     // string — lazy-computed base64
result.audio.mediaType  // "audio/mpeg"
```

Pass `provider/model` strings (e.g. `"elevenlabs/eleven_v3"`) to use Speech Gateway. String models use `SPEECH_GATEWAY_API_KEY` or the `apiKey` option and send the SDK request body to the gateway. Use provider factories such as `createOpenAI()` or `createElevenLabs()` to call the upstream provider directly with its own API key.

## Streaming

```ts
import { streamSpeech } from "@speech-sdk/core"

const result = await streamSpeech({
  model: "elevenlabs/eleven_v3",
  text: "...",
  voice: "voice-id",
})

for await (const chunk of result.audio) process.stdout.write(chunk)
```

## Multi-Speaker Conversations

If you're trying to create speech with multiple speakers (podcasts, dialogues, or any output with multiple voices), this is how you should do it. Use `generateConversation` — it returns a single stitched `SpeechResult` and handles dispatch, concatenation, gaps, and volume normalization. Some providers have native multi-speaker endpoints it will route to.

```ts
import { generateConversation } from "@speech-sdk/core/conversation"

const result = await generateConversation({
  model: "openai/gpt-4o-mini-tts", // default for every turn
  turns: [
    { voice: "alloy", text: "Welcome to the show." },
    { voice: "echo",  text: "Thanks for having me!" },
    { voice: "alloy", text: "Today we're covering TTS." },
  ],
})

result.audio.uint8Array // full mixed audio (Uint8Array)
result.audio.mediaType  // e.g. "audio/wav"
```

- **Per-turn overrides**: `{ voice, text, model?, providerOptions? }` — mix providers across turns (e.g. `openai/gpt-4o-mini-tts` for host + `elevenlabs/eleven_v3` for guest).
- **Dispatch**: providers with a native multi-speaker endpoint (e.g. ElevenLabs stitching, Fish Audio dialogue, Hume dialogue, Gemini multi-speaker) take the "native" path; everything else is stitched locally (parallel single-turn calls → PCM concat with inter-turn gap).
- **Volume normalization**: on by default — every conversation is RMS-leveled to ~-20 dBFS so separate outputs play back at the same loudness. Pass `normalizeVolume: false` to skip, or `volumeDbfs: -18` to retarget.
- **Options**: `gapMs` (default 300), `maxConcurrency` (default 6), `maxRetries` (default 2), `apiKey`, `abortSignal`, `headers`, `providerOptions` (top-level — merged with per-turn).
- **Errors**: `ConversationInputError` (bad input), `DialogueConstraintError` (native path can't satisfy turns), `StitchUnsupportedError` (provider can't emit PCM for stitching). Import from `@speech-sdk/core/conversation/errors`.

See `references/conversation.md` for the full API, cross-provider mixing, and native-vs-stitch dispatch details.

## Word-Level Timestamps

Pass `timestamps: "on"` to get word-level alignment alongside the audio. Default is `"auto"`. With direct provider factories, `"auto"` returns native timestamps when available and `"on"` falls back to an STT round-trip when the provider has no native alignment. Gateway routing: `generateSpeech` always hits `/v1/audio/speech/with-timestamps` when mode is `"auto"`/`"on"` and relies on the gateway (no client-side STT). `generateConversation` returns mixed audio from `/v1/audio/conversation` — `"auto"` returns without timestamps (endpoint carries none on the wire yet), `"on"` runs STT locally over the mixed audio and attributes words back to turns. When `/v1/audio/conversation/with-timestamps` ships, the SDK switches to the server-side path and the local fallback goes away.

```ts
const result = await generateSpeech({
  model: "elevenlabs/eleven_multilingual_v2",
  text: "Hello!",
  voice: "voice-id",
  timestamps: "on",
})

result.timestamps // [{ text, start, end }, ...] — seconds, word granularity
```

See `references/timestamps.md` for gateway behavior, direct-provider fallback behavior, custom STT providers, conversation behavior, gateway routing checks, and timestamp errors.

## Progressive Disclosure

This skill mirrors the public docs at <https://speechsdk.dev/docs>. Read the specific reference file when the user's task touches it — don't load everything up front.

### SpeechSDK

- `references/providers.md` — all 13 providers, prefixes, env vars, capability matrix
- `references/providers/<name>.md` — per-provider page (models, voices, audio tags, `providerOptions`, factory). One of: `openai`, `elevenlabs`, `deepgram`, `cartesia`, `hume`, `google`, `fish-audio`, `inworld`, `murf`, `resemble`, `fal`, `mistral`, `xai`

### Features

- `references/streaming.md` — `streamSpeech`, `StreamSpeechResult`, browser playback, `hasFeature(FEATURES.STREAMING)`, `StreamingNotSupportedError`
- `references/conversation.md` — `generateConversation`, turns, native-vs-stitch dispatch, volume normalization, cross-provider mixing
- `references/timestamps.md` — `timestamps: "on" | "auto" | "off"`, native vs derived cascade, `timestampProvider` override, STT fallback, conversation behavior
- `references/audio-tags.md` — standardized `[tag]` syntax, per-provider passthrough vs SSML vs stripped-with-warning
- `references/voice-cloning.md` — `{ audio }` / `{ url }` voice forms, which providers support cloning

### Usage

- `references/configuration.md` — factory functions (`createOpenAI`, etc.), `apiKey` / `baseURL` / `fetch` overrides, `maxRetries`, `abortSignal`, `headers`
- `references/result.md` — `SpeechResult`, `GeneratedAudioFile`, `providerMetadata`, `warnings`
- `references/error-handling.md` — `ApiError`, `NoSpeechGeneratedError`, `SpeechSDKError`, retry behavior

## Core Signature

```ts
generateSpeech({
  model: string | ResolvedModel,    // "openai/tts-1" or factory result
  text: string,
  voice: Voice,                     // string | { url } | { audio }
  providerOptions?: object,         // pass-through to provider API (no transformation)
  volumeDbfs?: number,              // RMS target loudness (≤ 0); gateway does server-side, direct providers use local WAV normalization
  timestamps?: "on" | "auto" | "off", // word-level alignment, default "auto"
  timestampProvider?: ResolvedSTTModel, // override the STT fallback (e.g. createOpenAISTT({ apiKey })("whisper-1"))
  maxRetries?: number,              // default 2; retries 5xx/network only
  abortSignal?: AbortSignal,
  headers?: Record<string, string>,
})
```

For string models, `providerOptions` are sent inside the Speech Gateway JSON body and gateway-owned transport headers (`Accept`, `Content-Type`, `Authorization`) cannot be overridden by caller headers. For direct provider factories, `providerOptions` use each upstream provider's own field names; some providers remap specific keys (e.g. ElevenLabs extracts `output_format`, `enable_logging`, `optimize_streaming_latency` into query params). See each provider reference for the exact shape.

Use `isSpeechGatewayModel(resolved)` for gateway-specific branches. Current gateway-specific `generateSpeech` behavior sends `timestamps` and `volumeDbfs` to Speech Gateway instead of doing local STT or local WAV normalization.
