# Speech SDK

[![npm version](https://img.shields.io/npm/v/@speech-sdk/core)](https://www.npmjs.com/package/@speech-sdk/core)
[![npm downloads](https://img.shields.io/npm/dm/@speech-sdk/core)](https://www.npmjs.com/package/@speech-sdk/core)
[![license](https://img.shields.io/npm/l/@speech-sdk/core)](https://github.com/Jellypod-Inc/speech-sdk/blob/main/LICENSE)
[![Discord](https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white)](https://discord.gg/xcTQMU3nCV)

A lightweight, provider-agnostic TypeScript SDK for text-to-speech. One API, 13 providers, zero lock-in. Runs in Node.js, Edge runtimes, and the browser.

<img width="1200" height="630" alt="Speech SDK" src="https://github.com/user-attachments/assets/b90c0235-9405-4939-bffa-75fc82be5afb" />

Learn more at [speechsdk.dev](https://speechsdk.dev/).

## Features

- **Universal** — `generateSpeech()` works across OpenAI, ElevenLabs, Deepgram, Cartesia, Hume, Google Gemini TTS, Fish Audio, Inworld, Murf, Resemble, fal, Mistral, and xAI.
- **Streaming** — `streamSpeech()` returns a standard `ReadableStream<Uint8Array>`.
- **Conversations** — `generateConversation()` produces multi-speaker audio, routing through the Speech Gateway fast-path when every turn uses the same gateway-routed model, using native dialogue endpoints where available, and stitching locally when neither applies.
- **Word-level timestamps** — `timestamps: true` returns alignment, using the provider's native data or falling back to STT.
- **Volume normalization** — RMS-level outputs to an absolute loudness target.
- **Audio tags & voice cloning** — `[laugh]`, `[sigh]`, emotion cues; reference-audio cloning where supported.

## Contents

- [Install](#install) · [Quick start](#quick-start) · [Supported providers](#supported-providers)
- [Streaming](#streaming) · [Conversations](#conversations) · [Timestamps](#timestamps)
- [Volume normalization](#volume-normalization) · [Audio tags](#audio-tags) · [Voice cloning](#voice-cloning)
- [Custom configuration](#custom-configuration) · [Public imports](#public-imports) · [API reference](#api-reference) · [Error handling](#error-handling) · [Development](#development)

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

Pass a `provider/model` string, or just the provider name to use its default model. The string above is enough to get going — set one env var and you're done.

## Gateway vs direct provider

The SDK has two ways to reach a provider, and the choice is made by **how you pass `model`**:

```ts
// 1. String → routes through Speech Gateway (https://api.speechgateway.com)
//    Needs SPEECH_GATEWAY_API_KEY (sign up at https://speechgateway.com).
//    One key, one bill, no per-vendor accounts.
await generateSpeech({ model: 'openai/gpt-4o-mini-tts', text: '...', voice: 'alloy' });

// 2. Factory → calls the provider directly (no proxy hop)
//    Reads the provider's env var (e.g. OPENAI_API_KEY), or pass apiKey to the factory.
import { createOpenAI } from '@speech-sdk/core/providers';
await generateSpeech({ model: createOpenAI()('gpt-4o-mini-tts'), text: '...', voice: 'alloy' });
```

| | Speech Gateway (string) | Direct provider (factory) |
|---|---|---|
| When to use | You want one bill, one key, easy provider swaps | You already have provider keys, want zero-hop latency, or need provider features the gateway hasn't surfaced |
| Setup | `SPEECH_GATEWAY_API_KEY` only | One env var per provider you use |
| Key resolution | `apiKey` option → `SPEECH_GATEWAY_API_KEY` | `createX({ apiKey })` → `<PROVIDER>_API_KEY` |
| Endpoint | `api.speechgateway.com` | Provider's own API |

The gateway also accepts `createSpeechGateway({ apiKey, baseURL })` if you want to construct it explicitly (e.g. for a custom proxy URL).

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

The "Env var" column applies when you call the provider **directly** via its factory (`createOpenAI()`, `createElevenLabs()`, etc.). Import provider factories from `@speech-sdk/core/providers`. When you pass a string `model` like `"openai/tts-1"`, the request goes through Speech Gateway and reads `SPEECH_GATEWAY_API_KEY` instead — see [Gateway vs direct provider](#gateway-vs-direct-provider).

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

- **Gateway fast-path** — every turn uses the same gateway-routed string model (e.g. `"elevenlabs/eleven_v3"`). The SDK sends one HTTP request to the Speech Gateway and the server handles rendering, stitching, and normalization. Faster than local stitch, and gateway users don't pay for the audio-mux code in their bundle. Allow-by-default for any gateway-routed model; voice-clone voices (`{url}` / `{audio}` shapes) still take the stitch path.
- **Native dialogue** — one direct provider with a multi-speaker endpoint (ElevenLabs v3, Gemini TTS, Hume Octave, Fish Audio S2-Pro, fal Dia). One API call, natural mix.
- **Stitch fallback** — multi-provider, voice clones, or no dialogue endpoint. Runs turns in parallel, RMS-levels each, inserts silence, returns a single WAV.

```ts
import { generateConversation } from '@speech-sdk/core';

const result = await generateConversation({
  turns: [
    { model: 'openai/tts-1',                     voice: 'nova',                 text: "Hi, I'm hosted by OpenAI." },
    { model: 'elevenlabs/eleven_multilingual_v2', voice: 'JBFqnCBsd6RMkjVDRZzb', text: "And I'm hosted by ElevenLabs." },
    { model: 'hume/octave-2',                    voice: 'Kora',                 text: "I'm Hume Octave. Thanks for listening." },
  ],
});
```

Options: `gapMs` (default 300), `volumeDbfs` (default `-20`), `maxConcurrency` (default 6), `maxRetries` (default 2), `timestamps`, `apiKey`, `providerOptions`, `abortSignal`, `headers`. Per-turn overrides: `model`, `providerOptions` (stitch path only — throws `ConversationInputError` on native).

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
  timestamps: true,
});

result.timestamps;
// [
//   { text: "Hello",  start: 0.00, end: 0.32 },
//   { text: "from",   start: 0.36, end: 0.55 },
//   ...
// ]
```

| Value | Behavior |
|---|---|
| `true` | Always return timestamps. Uses native alignment when available; otherwise transcribes the audio via STT (extra cost + latency). |
| `false` *(default)* | Never return timestamps. |

With `timestamps: true`, models without native alignment require an STT fallback. The SDK automatically uses OpenAI Whisper when `OPENAI_API_KEY` is set in the environment — no extra configuration needed. Gateway-routed models (string model IDs like `"openai/tts-1"`) do not need a fallback — the gateway server provides it.

**Resolution order:** factory `fallbackSTT` → `OPENAI_API_KEY` env var (automatic Whisper fallback) → throws `TimestampKeyMissingError`.

Configure `fallbackSTT` on the factory to use a different key or STT model (set it once, applies to all calls):

```ts
import { generateSpeech } from '@speech-sdk/core';
import { createOpenAI, createElevenLabs } from '@speech-sdk/core/providers';

const elevenlabs = createElevenLabs({
  apiKey: process.env.ELEVENLABS_API_KEY,
  fallbackSTT: createOpenAI({ apiKey: process.env.MY_OPENAI_KEY }).stt('whisper-1'),
});

const result = await generateSpeech({
  model: elevenlabs('eleven_flash_v2'),
  voice: 'JBFqnCBsd6RMkjVDRZzb',
  text: 'Hello, world.',
  timestamps: true,
});
```

**Per-provider support:**

| Provider | Timestamps |
|---|---|
| ElevenLabs (`eleven_v3`, `eleven_multilingual_v2`, `eleven_flash_v2`, `eleven_flash_v2_5`) | **Native** — returned in the TTS response, no STT round-trip on `true` |
| Murf (`GEN2`) | **Native** — `wordDurations` returned in the TTS response, no STT round-trip on `true` (FALCON streaming model has no native alignment) |
| Hume (`octave-2`) | **Native** — word alignment from the JSON `/v0/tts` endpoint, no STT round-trip on `true` (`octave-1` has no native alignment) |
| Inworld (`inworld-tts-1.5-max`, `inworld-tts-1.5-mini`) | **Native** — `timestampInfo.wordAlignment` returned in the TTS response, no STT round-trip on `true` (best on English/Spanish) |
| Cartesia (`sonic-3`, `sonic-2`) | **Native** — routed through `/tts/sse` with `add_timestamps: true`; merges interleaved chunk + timestamps events into audio + `WordTimestamp[]` |
| Resemble (`default`) | **Native** — `audio_timestamps` always returned by `/synthesize`; SDK aggregates grapheme-level timing into words (mirrors ElevenLabs aggregator) |
| All others (OpenAI, Deepgram, Google, Fish Audio, fal, Mistral, xAI) | No native alignment; `true` transcribes via the STT fallback |

`generateConversation` accepts the same options and returns `ConversationWordTimestamp[]` — every word carries a `turnIndex: number` pointing back into the input `turns[]`. Stitch-path timings are offset by cumulative turn duration + gap; gateway and native-dialogue paths derive `turnIndex` from the server-attributed word sequence.

`turnIndex` is why conversation timestamps are a different type from speech. It is what lets you build chat-bubble UIs, speaker-attributed transcripts, and "who's speaking now?" lookups during playback — without re-deriving turn boundaries from `gapMs` and per-turn durations.

```ts
import { generateConversation, timestampsToTurns } from '@speech-sdk/core';

const turns = [
  { voice: 'rachel', text: 'Hi there.' },
  { voice: 'adam',   text: 'Hello!' },
];

const result = await generateConversation({
  model: 'elevenlabs/eleven_v3',
  turns,
  timestamps: true,
});

// result.timestamps is ConversationWordTimestamp[]: { text, start, end, turnIndex }[]
// Collapse consecutive words from the same turn into per-turn timings:
const turnTimestamps = timestampsToTurns(result.timestamps ?? []);
// [
//   { turnIndex: 0, start: 0.00, end: 0.42, text: 'Hi there.' },
//   { turnIndex: 1, start: 0.72, end: 1.05, text: 'Hello!' },
// ]

// Look the speaking voice up by turnIndex against the input turns:
const annotated = turnTimestamps.map((t) => ({ ...t, voice: turns[t.turnIndex].voice }));

// Natural input for chat-bubble UIs, speaker-attributed captions, or
// karaoke-style highlighting during playback.
```

### Captions (SRT / WebVTT)

Convert word-level timestamps into a caption file. SRT is the default; pass `format: 'vtt'` for WebVTT (required for HTML `<track>`).

```ts
import { generateSpeech, timestampsToCaptions } from '@speech-sdk/core';

const { timestamps } = await generateSpeech({
  model: 'elevenlabs/eleven_v3',
  text: 'Hello world. This is a test.',
  voice: 'JBFqnCBsd6RMkjVDRZzb',
  timestamps: true,
});

const srt = timestampsToCaptions(timestamps ?? []);
// 1
// 00:00:00,000 --> 00:00:01,200
// Hello world.
//
// 2
// 00:00:01,300 --> 00:00:02,800
// This is a test.

const vtt = timestampsToCaptions(timestamps ?? [], { format: 'vtt' });
// WEBVTT
//
// 1
// 00:00:00.000 --> 00:00:01.200
// Hello world.
//
// 2
// 00:00:01.300 --> 00:00:02.800
// This is a test.
```

Output follows the SubRip and [W3C WebVTT](https://www.w3.org/TR/webvtt1/) conventions: comma-decimal (SRT) vs period-decimal (VTT) timestamps, sequential numeric cue IDs, blank-line cue separators with a trailing blank line, and HTML-escaped body text (`&`, `<`, `>`) on the VTT path.

Cues break on sentence boundaries (`.`, `!`, `?`), then subdivide long sentences by character count, cue duration, and soft comma breaks. Pass `CaptionsOptions` to customize `format`, `maxLineLength`, `maxLinesPerCue`, `maxCharsPerCue`, `maxCueDurationMs`, or `longPhraseCommaBreakChars`.

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

`generateConversation` always normalizes; override the target with `volumeDbfs`. A warning is surfaced (and the raw mix passes through) if the provider has no decodable PCM/WAV mode.

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
import { createFal, createMistral } from '@speech-sdk/core/providers';

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
import { createOpenAI } from '@speech-sdk/core/providers';

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

## Public imports

The root package exports the main runtime APIs:

```ts
import {
  generateSpeech,
  streamSpeech,
  generateConversation,
  timestampsToCaptions,
  ApiError,
} from '@speech-sdk/core';
```

Provider and STT factories live under `@speech-sdk/core/providers`:

```ts
import {
  createOpenAI,
  createElevenLabs,
  createCartesia,
  createSpeechGateway,
} from '@speech-sdk/core/providers';
```

Public types live under `@speech-sdk/core/types`:

```ts
import type {
  GenerateSpeechOptions,
  SpeechResult,
  ConversationResult,
  Voice,
  WordTimestamp,
} from '@speech-sdk/core/types';
```

## API reference

```ts
generateSpeech({
  model: string | ResolvedModel,          // required
  text: string,                           // required
  voice: Voice,                           // required — string | { url } | { audio }
  providerOptions?: object,
  volumeDbfs?: number,                    // ≤ 0
  timestamps?: boolean,                   // default false
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

// Returned by generateConversation — extends WordTimestamp with turnIndex
interface ConversationWordTimestamp extends WordTimestamp {
  turnIndex: number;  // index into the input turns[] array
}
```

## Error handling

```ts
import { generateSpeech, ApiError } from '@speech-sdk/core';

try {
  await generateSpeech({ /* ... */ });
} catch (error) {
  if (error instanceof ApiError) {
    error.statusCode;    // 401, 429, 500, ...
    error.responseBody;
    error.code;          // stable machine-readable code (optional)
  }
}
```

`ApiError.code` is populated from the RFC 7807 `application/problem+json` `code` extension when the upstream provides one (currently only the Speech Gateway). Match on `err.code` over `err.message` text — codes are a stable contract, messages aren't.

| Error | When |
|---|---|
| `ApiError` | Provider returned non-2xx |
| `NoSpeechGeneratedError` | Empty input (after tag stripping) or empty provider response |
| `StreamingNotSupportedError` | `streamSpeech()` on a non-streaming model |
| `VolumeAdjustmentUnsupportedError` | `volumeDbfs` with no decodable output mode |
| `TimestampKeyMissingError` | `timestamps: true` with no native support, no `fallbackSTT` configured, and `OPENAI_API_KEY` not set |
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
