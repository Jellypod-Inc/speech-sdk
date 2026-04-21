# Speech SDK

[![npm version](https://img.shields.io/npm/v/@speech-sdk/core)](https://www.npmjs.com/package/@speech-sdk/core)
[![npm downloads](https://img.shields.io/npm/dm/@speech-sdk/core)](https://www.npmjs.com/package/@speech-sdk/core)
[![license](https://img.shields.io/npm/l/@speech-sdk/core)](https://github.com/Jellypod-Inc/speech-sdk/blob/main/LICENSE)

A lightweight, provider-agnostic TypeScript SDK for text-to-speech. One API, 13 providers, zero lock-in. Runs in Node.js, Edge runtimes, and the browser.

<img width="1200" height="630" alt="Speech SDK" src="https://github.com/user-attachments/assets/b90c0235-9405-4939-bffa-75fc82be5afb" />

Learn more at [speechsdk.dev](https://speechsdk.dev/).

## Features

- **Universal** — `generateSpeech()` works across OpenAI, ElevenLabs, Deepgram, Cartesia, Hume, Google Gemini TTS, Fish Audio, Inworld, Murf, Resemble, fal, Mistral, and xAI.
- **Streaming** — `streamSpeech()` returns a standard `ReadableStream<Uint8Array>`.
- **Conversations** — `generateConversation()` produces multi-speaker audio, using native dialogue endpoints when available and stitching locally when not.
- **Word-level timestamps** — `timestamps: "on"` returns alignment, using the provider's native data or falling back to STT.
- **Volume normalization** — RMS-level outputs to an absolute loudness target.
- **Audio tags & voice cloning** — `[laugh]`, `[sigh]`, emotion cues; reference-audio cloning where supported.

## Contents

- [Install](#install) · [Quick start](#quick-start) · [Supported providers](#supported-providers)
- [Streaming](#streaming) · [Conversations](#conversations) · [Timestamps](#timestamps)
- [Volume normalization](#volume-normalization) · [Audio tags](#audio-tags) · [Voice cloning](#voice-cloning)
- [Custom configuration](#custom-configuration) · [API reference](#api-reference) · [Error handling](#error-handling) · [Development](#development)

## Install

```bash
npm install @speech-sdk/core
```

> [!TIP]
> Using an AI coding assistant? Add the speech-sdk skill to give it full knowledge of this library: `npx skills add Jellypod-Inc/speech-sdk --skill speech-sdk`.

## Quick start

```ts
import { generateSpeech } from '@speech-sdk/core';

const result = await generateSpeech({
  model: 'openai/gpt-4o-mini-tts',
  text: 'Hello from speech-sdk!',
  voice: 'alloy',
});

result.audio.uint8Array;  // Uint8Array
result.audio.base64;      // string (lazy)
result.audio.mediaType;   // "audio/mpeg"
```

Pass a `provider/model` string, or just the provider name to use its default model. API keys are read from env vars automatically.

## Supported providers

| Provider | Prefix | Default model | Env var |
|---|---|---|---|
| [OpenAI](https://platform.openai.com/docs/guides/text-to-speech) | `openai` | `gpt-4o-mini-tts` | `OPENAI_API_KEY` |
| [ElevenLabs](https://elevenlabs.io/docs) | `elevenlabs` | `eleven_multilingual_v2` | `ELEVENLABS_API_KEY` |
| [Deepgram](https://developers.deepgram.com/docs/text-to-speech) | `deepgram` | `aura-2` | `DEEPGRAM_API_KEY` |
| [Cartesia](https://docs.cartesia.ai) | `cartesia` | `sonic-3` | `CARTESIA_API_KEY` |
| [Hume](https://dev.hume.ai/docs/text-to-speech-tts/overview) | `hume` | `octave-2` | `HUME_API_KEY` |
| [Inworld](https://docs.inworld.ai/tts) | `inworld` | `inworld-tts-1.5-max` | `INWORLD_API_KEY` |
| [Google Gemini TTS](https://docs.cloud.google.com/text-to-speech/docs/gemini-tts) | `google` | `gemini-2.5-flash-preview-tts` | `GOOGLE_API_KEY` |
| [Fish Audio](https://docs.fish.audio) | `fish-audio` | `s2-pro` | `FISH_AUDIO_API_KEY` |
| [Murf](https://murf.ai/api/docs) | `murf` | `GEN2` | `MURF_API_KEY` |
| [Resemble](https://docs.resemble.ai) | `resemble` | `default` | `RESEMBLE_API_KEY` |
| [fal](https://fal.ai/models) | `fal-ai` | *(user-specified)* | `FAL_API_KEY` |
| [Mistral](https://docs.mistral.ai/capabilities/audio/text_to_speech/speech) | `mistral` | `voxtral-mini-tts-2603` | `MISTRAL_API_KEY` |
| [xAI](https://docs.x.ai/docs/models) | `xai` | `grok-tts` | `XAI_API_KEY` |

Provider-specific parameters pass through via `providerOptions` using each API's native field names.

## Streaming

`streamSpeech()` returns audio incrementally as a `ReadableStream<Uint8Array>`.

```ts
import { streamSpeech } from '@speech-sdk/core';

const { audio, mediaType } = await streamSpeech({
  model: 'cartesia/sonic-3',
  text: 'Streaming straight to the client.',
  voice: 'voice-id',
});

// Forward to an HTTP response:
return new Response(audio, { headers: { 'Content-Type': mediaType } });
```

> [!NOTE]
> Retries apply only until response headers arrive; mid-stream errors propagate to the consumer. Calling `streamSpeech()` on a non-streaming model throws `StreamingNotSupportedError`.

## Conversations

`generateConversation()` produces a single multi-voice clip from an ordered array of turns, picking the best path automatically:

- **Native dialogue** — one provider with a multi-speaker endpoint (ElevenLabs v3, Gemini TTS, Hume Octave, Fish Audio S2-Pro, fal Dia). One API call, natural mix.
- **Stitch fallback** — multi-provider or no dialogue endpoint. Runs turns in parallel, RMS-levels each, inserts silence, returns a single WAV.

```ts
import { generateConversation } from '@speech-sdk/core/conversation';

const result = await generateConversation({
  turns: [
    { model: 'openai/tts-1',                     voice: 'nova',                 text: "Hi, I'm hosted by OpenAI." },
    { model: 'elevenlabs/eleven_multilingual_v2', voice: 'JBFqnCBsd6RMkjVDRZzb', text: "And I'm hosted by ElevenLabs." },
    { model: 'hume/octave-2',                    voice: 'Kora',                 text: "I'm Hume Octave. Thanks for listening." },
  ],
});
```

Options: `gapMs` (default 300), `normalizeVolume` (default `true`), `volumeDbfs` (default `-20`), `maxConcurrency` (default 6), `maxRetries` (default 2), `timestamps`, `apiKey`, `providerOptions`, `abortSignal`, `headers`. Per-turn overrides: `model`, `providerOptions` (stitch path only — throws `ConversationInputError` on native).

**Native dialogue caps:**

| Provider | Models | Voice constraints |
|---|---|---|
| ElevenLabs | `eleven_v3` | 1–10 voices, ≤ 2,000 chars |
| Google | `gemini-2.5-{flash,pro}-preview-tts`, `gemini-3.1-flash-tts-preview` | **Exactly 2 voices** |
| Hume | `octave-1`, `octave-2` | 1–4 voices |
| Fish Audio | `s2-pro` | 1–4 voices |

## Timestamps

Pass `timestamps` to get word-level alignment. Timings are in seconds from the start of the audio.

```ts
const result = await generateSpeech({
  model: 'elevenlabs/eleven_multilingual_v2',
  text: 'Hello from speech-sdk!',
  voice: 'JBFqnCBsd6RMkjVDRZzb',
  timestamps: 'on',
});

result.timestamps;
// [
//   { text: "Hello",  start: 0.00, end: 0.32 },
//   { text: "from",   start: 0.36, end: 0.55 },
//   ...
// ]
```

| Mode | Behavior |
|---|---|
| `"auto"` *(default)* | Return timestamps only if the provider supplies them natively. Free. |
| `"on"` | Always return timestamps. Uses native alignment when available; otherwise transcribes the audio via STT (extra cost + latency). |
| `"off"` | Never return timestamps. |

On `"on"`, the fallback defaults to OpenAI Whisper (`openai/whisper-1`, needs `OPENAI_API_KEY`). Override with `timestampProvider` (`"provider/model"` string or `ResolvedSTTModel`) and `timestampApiKey`.

**Per-provider support:**

| Provider | Timestamps |
|---|---|
| ElevenLabs (`eleven_v3`, `eleven_multilingual_v2`, `eleven_flash_v2`, `eleven_flash_v2_5`) | **Native** — returned in the TTS response, free on `"auto"` |
| OpenAI (`gpt-4o-mini-tts`, `tts-1`, `tts-1-hd`) | Derived — transcribed via Whisper on `"on"` |
| All others (Deepgram, Cartesia, Hume, Google, Fish Audio, Inworld, Murf, Resemble, fal, Mistral, xAI) | No native alignment; `"on"` routes through the STT fallback, `"auto"` returns `undefined` |

`generateConversation` accepts the same options and returns a flat `WordTimestamp[]` across all turns — stitch-path timings are offset by cumulative turn duration + gap.

## Volume normalization

Pass `volumeDbfs` to RMS-normalize to an absolute target loudness (must be ≤ 0; `-20` is the broadcast/podcast convention).

```ts
const result = await generateSpeech({
  model: 'openai/gpt-4o-mini-tts',
  text: 'Hello!',
  voice: 'alloy',
  volumeDbfs: -20,
});

result.audio.mediaType;  // "audio/wav" — re-encoded after normalization
```

`generateConversation` normalizes by default. Pass `normalizeVolume: false` to skip. Throws `VolumeAdjustmentUnsupportedError` if the provider has no decodable PCM/WAV mode.

## Audio tags

Bracket syntax `[tag]` adds expressive cues. Unsupported tags are stripped with warnings in `result.warnings`.

```ts
await generateSpeech({
  model: 'elevenlabs/eleven_v3',
  text: '[laugh] Oh that is so funny! [sigh] But seriously though.',
  voice: 'voice-id',
});
```

| Provider | Behavior |
|---|---|
| OpenAI (`gpt-4o-mini-tts`) | Mapped to the `instructions` field |
| ElevenLabs (`eleven_v3`) | Passed through natively |
| Google (`gemini-3.1-flash-tts-preview`) | Passed through natively |
| Cartesia (`sonic-3`) | Emotion tags → SSML; `[laughter]` passed through; unknown stripped |
| All others | Stripped with warnings |

## Voice cloning

Some providers support reference-audio cloning. Pass a voice object instead of a string.

```ts
import { createMistral } from '@speech-sdk/core/mistral';
import { createFal } from '@speech-sdk/core/fal-ai';

// Base64 reference:
await generateSpeech({
  model: createMistral()(),
  text: 'Hello!',
  voice: { audio: 'base64-encoded-audio...' },
});

// URL reference:
await generateSpeech({
  model: createFal()('fal-ai/f5-tts'),
  text: 'Hello!',
  voice: { url: 'https://example.com/reference.wav' },
});
```

## Custom configuration

Factory functions give you custom API keys, base URLs, or `fetch` implementations:

```ts
import { generateSpeech } from '@speech-sdk/core';
import { createOpenAI } from '@speech-sdk/core/openai';

const myOpenAI = createOpenAI({
  apiKey: 'sk-...',
  baseURL: 'https://my-proxy.com/v1',
});

await generateSpeech({
  model: myOpenAI('gpt-4o-mini-tts'),
  text: 'Hello!',
  voice: 'alloy',
});
```

## API reference

```ts
generateSpeech({
  model: string | ResolvedModel,          // required
  text: string,                           // required
  voice: Voice,                           // required — string | { url } | { audio }
  providerOptions?: object,
  volumeDbfs?: number,                    // ≤ 0
  timestamps?: "on" | "auto" | "off",     // default "auto"
  timestampProvider?: string | ResolvedSTTModel,
  timestampApiKey?: string,
  maxRetries?: number,                    // default 2
  abortSignal?: AbortSignal,
  headers?: Record<string, string>,
}): Promise<SpeechResult>

interface SpeechResult {
  audio: { uint8Array: Uint8Array; base64: string; mediaType: string };
  metadata: { latencyMs: number; inputChars: number; provider: string; model: string; audioDurationMs?: number; ttfbMs?: number };
  timestamps?: WordTimestamp[];
  providerMetadata?: Record<string, unknown>;
  warnings?: string[];
}

interface WordTimestamp { text: string; start: number; end: number }  // seconds
```

## Error handling

```ts
import { generateSpeech, ApiError } from '@speech-sdk/core';

try {
  await generateSpeech({ /* ... */ });
} catch (error) {
  if (error instanceof ApiError) {
    error.statusCode;    // 401, 429, 500, ...
    error.model;         // "openai/gpt-4o-mini-tts"
    error.responseBody;
  }
}
```

| Error | When |
|---|---|
| `ApiError` | Provider returned non-2xx |
| `NoSpeechGeneratedError` | Empty input (after tag stripping) or empty provider response |
| `StreamingNotSupportedError` | `streamSpeech()` on a non-streaming model |
| `VolumeAdjustmentUnsupportedError` | `volumeDbfs` with no decodable output mode |
| `TimestampKeyMissingError` | `timestamps: "on"` fallback key missing |
| `ConversationInputError` / `DialogueConstraintError` / `StitchUnsupportedError` | `generateConversation` validation / native caps / stitch incompatibility |
| `SpeechSDKError` | Base class |

Retries 5xx and network errors with exponential backoff ([p-retry](https://github.com/sindresorhus/p-retry)); does not retry 4xx. Default 2 retries; override via `maxRetries`.

## Development

```bash
pnpm install
pnpm test              # unit tests
pnpm run test:e2e      # e2e tests (requires provider API keys)
pnpm run typecheck
pnpm fix               # format + lint
```

E2E tests hit real provider APIs. Set the relevant keys in `.env` or export them. Set `SPEECH_SDK_E2E_OUTPUT_DIR=~/Downloads/convos` to write conversation e2e audio to disk.
