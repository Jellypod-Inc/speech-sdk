---
name: speech-sdk
description: "How to use @speech-sdk/core for text-to-speech and multi-speaker conversations across providers. Use this skill whenever the user wants to generate speech audio, convert text to speech, stream TTS output, build a multi-speaker podcast or dialogue, get word-level timestamps / alignment for TTS, clone a voice, or integrate @speech-sdk/core. Also trigger on imports from '@speech-sdk/core' or its subpath exports."
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
  model: "provider/model",
  text: "Hello from SpeechSDK!",
  voice: "voice-id",
})

result.audio.uint8Array // raw audio bytes
result.audio.base64     // lazy-computed base64
result.audio.mediaType
```

Pass `provider/model` strings to dispatch via `SPEECH_GATEWAY_API_KEY` (or the `apiKey` option). Use provider factories from `@speech-sdk/core/providers` to call the upstream provider directly with its own API key. See `references/providers.md` for the list of providers and their factories.

## Streaming

```ts
import { streamSpeech } from "@speech-sdk/core"

const result = await streamSpeech({
  model: "provider/model",
  text: "...",
  voice: "voice-id",
})

for await (const chunk of result.audio) process.stdout.write(chunk)
```

## Multi-Speaker Conversations

If you're trying to create speech with multiple speakers (podcasts, dialogues, or any output with multiple voices), this is how you should do it. Use `generateConversation` — it returns a single stitched result and handles dispatch, concatenation, gaps, and volume normalization.

```ts
import { generateConversation } from "@speech-sdk/core"

const result = await generateConversation({
  model: "provider/model", // default for every turn
  turns: [
    { voice: "voice-a", text: "Welcome to the show." },
    { voice: "voice-b", text: "Thanks for having me!" },
    { voice: "voice-a", text: "Today we're covering TTS." },
  ],
})

result.audio.uint8Array
result.audio.mediaType
```

- **Per-turn overrides**: `{ voice, text, model?, providerOptions? }` — mix providers across turns.
- **Volume normalization**: always on — every conversation is RMS-leveled to ~-20 dBFS so separate outputs play back at the same loudness. Pass `volumeDbfs: -18` (must be ≤ 0) to retarget.
- **Options**: `gapMs` (default 300), `maxConcurrency` (default 6), `maxRetries` (default 2), `apiKey`, `abortSignal`, `headers`, `providerOptions` (top-level — merged with per-turn).
- **Errors**: `ConversationInputError`, `DialogueConstraintError`, `MixedDispatchError`, `StitchUnsupportedError`. Import from `@speech-sdk/core`.

See `references/conversation.md` for the full API and cross-provider mixing.

## Word-Level Timestamps

Pass `timestamps: "on"` to get word-level alignment alongside the audio. Default is `"off"`. The SDK uses the provider's native alignment when available and falls back to an STT round-trip otherwise — `result.timestamps` always populates when mode is `"on"`.

```ts
const result = await generateSpeech({
  model: "provider/model",
  text: "Hello!",
  voice: "voice-id",
  timestamps: "on",
})

result.timestamps // [{ text, start, end }, ...] — seconds, word granularity
```

See `references/timestamps.md` for the native-vs-STT cascade, custom STT providers, conversation behavior, and timestamp errors.

## Progressive Disclosure

This skill mirrors the public docs at <https://speechsdk.dev/docs>. Read the specific reference file when the user's task touches it — don't load everything up front.

### SpeechSDK

- `references/providers.md` — all providers, prefixes, env vars, capability matrix
- `references/providers/<name>.md` — per-provider page (models, voices, audio tags, `providerOptions`, factory)

### Features

- `references/streaming.md` — `streamSpeech`, browser playback, `StreamingNotSupportedError`
- `references/conversation.md` — `generateConversation`, turns, volume normalization, cross-provider mixing
- `references/timestamps.md` — `timestamps: "on" | "off"`, native vs derived cascade, `timestampProvider` override, STT fallback, conversation behavior
- `references/audio-tags.md` — standardized `[tag]` syntax
- `references/voice-cloning.md` — `{ audio }` / `{ url }` voice forms

### Usage

- `references/configuration.md` — factory functions, `apiKey` / `baseURL` / `fetch` overrides, `maxRetries`, `abortSignal`, `headers`
- `references/result.md` — result shape, `providerMetadata`, `warnings`
- `references/error-handling.md` — `ApiError`, `NoSpeechGeneratedError`, `SpeechSDKError`, retry behavior

## Core Signature

`generateSpeech({ model, text, voice, providerOptions?, volumeDbfs?, timestamps?, maxRetries?, abortSignal?, headers? })`

- `model` — `"provider/model"` string or a factory-resolved model
- `voice` — string voice ID, `{ audio }`, or `{ url }`
- `providerOptions` — pass-through to the provider API (untransformed; some providers remap specific keys — see `providers/<name>.md`)
- `timestamps` — `"on"` or `"off"` (default `"off"`)
- `maxRetries` — default 2; retries 5xx and network only

The SDK reserves the `Accept`, `Content-Type`, and `Authorization` request headers — caller-supplied `headers` cannot override them. Import the exact option / result types from `@speech-sdk/core` / `@speech-sdk/core/types` when you need them; the source is authoritative.
