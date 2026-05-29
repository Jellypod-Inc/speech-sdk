<div align="center">

<img src="https://github.com/user-attachments/assets/42d9b528-e507-4162-8120-338bb0c92650" alt="Speech SDK" width="140" />

# Speech SDK

**Text-to-speech across 13 providers, one API.**

A lightweight, provider-agnostic TypeScript SDK. Zero lock-in. Runs in Node.js, Edge runtimes, and the browser.

[![npm version](https://img.shields.io/npm/v/@speech-sdk/core?style=flat-square)](https://www.npmjs.com/package/@speech-sdk/core)
[![npm downloads](https://img.shields.io/npm/dm/@speech-sdk/core?style=flat-square)](https://www.npmjs.com/package/@speech-sdk/core)
[![license](https://img.shields.io/npm/l/@speech-sdk/core?style=flat-square)](https://github.com/Jellypod-Inc/speech-sdk/blob/main/LICENSE)
[![Discord](https://img.shields.io/badge/Discord-Join-5865F2?style=flat-square&logo=discord&logoColor=white)](https://discord.gg/xcTQMU3nCV)
[![Stars](https://img.shields.io/github/stars/Jellypod-Inc/speech-sdk?style=flat-square&logo=github&label=stars)](https://github.com/Jellypod-Inc/speech-sdk/stargazers)

**[Quick start](#quick-start)** · **[Providers](#supported-providers)** · **[Streaming](#streaming)** · **[Multi-Speaker Conversations](#conversations)** · **[Timestamps](#timestamps)**

</div>

<br />

<img width="1200" height="630" alt="Speech SDK" src="https://github.com/user-attachments/assets/b90c0235-9405-4939-bffa-75fc82be5afb" />

Learn more at [speechsdk.dev](https://speechsdk.dev/).

## Features

- **Universal** — one `generateSpeech()` call across every supported provider.
- **Streaming** — `streamSpeech()` returns a standard `ReadableStream<Uint8Array>`.
- **Conversations** — `generateConversation()` produces multi-speaker audio, picking a gateway, native-dialogue, or local-stitch path automatically.
- **Word-level timestamps** — `timestamps: true` returns alignment, using the provider's native data or falling back to STT.
- **Volume normalization** — RMS-level outputs to an absolute loudness target.
- **Audio tags & voice cloning** — bracket cues like `[laugh]` and reference-audio cloning where supported.

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
// 1. String → routes through Speech Gateway (https://api.speechbase.ai)
//    Needs SPEECHBASE_API_KEY (sign up at https://speechbase.ai).
await generateSpeech({ model: 'openai/gpt-4o-mini-tts', text: '...', voice: 'alloy' });

// 2. Factory → calls the provider directly (no proxy hop)
//    Reads the provider's env var (e.g. OPENAI_API_KEY), or pass apiKey to the factory.
import { createOpenAI } from '@speech-sdk/core/providers';
await generateSpeech({ model: createOpenAI()('gpt-4o-mini-tts'), text: '...', voice: 'alloy' });
```

| | Speech Gateway (string) | Direct provider (factory) |
|---|---|---|
| When to use | You want a single endpoint and easy provider swaps | You already have provider keys, want zero-hop latency, or need provider features the gateway hasn't surfaced |
| Setup | `SPEECHBASE_API_KEY` only | One env var per provider you use |
| Key resolution | `apiKey` option → `SPEECHBASE_API_KEY` → `SPEECH_GATEWAY_API_KEY` (legacy) | `createX({ apiKey })` → `<PROVIDER>_API_KEY` |
| Endpoint | `api.speechbase.ai` | Provider's own API |

The gateway also accepts `createSpeechGateway({ apiKey, baseURL })` if you want to construct it explicitly (e.g. for a custom proxy URL).

### Per-request moderation ruleset (gateway only)

Pass an optional `moderationRulesetId` (UUID) on `generateSpeech`, `streamSpeech`, or `generateConversation` to override the org's default moderation ruleset for that one request.

```ts
await generateSpeech({
  model: 'openai/tts-1',
  voice: 'alloy',
  text: 'Hello.',
  moderationRulesetId: '11111111-1111-1111-1111-111111111111',
});
```

If the ID is missing, deleted, or belongs to another org, the gateway falls back to the org default. Gateway-only — passing it on a direct-provider model or non-gateway conversation path throws `ModerationRulesetIdRequiresGatewayError`.

## Supported providers

| Provider | Prefix | Env var |
|---|---|---|
| [OpenAI](https://platform.openai.com/docs/guides/text-to-speech) | `openai` | `OPENAI_API_KEY` |
| [ElevenLabs](https://elevenlabs.io/docs) | `elevenlabs` | `ELEVENLABS_API_KEY` |
| [Deepgram](https://developers.deepgram.com/docs/text-to-speech) | `deepgram` | `DEEPGRAM_API_KEY` |
| [Cartesia](https://docs.cartesia.ai) | `cartesia` | `CARTESIA_API_KEY` |
| [Hume](https://dev.hume.ai/docs/text-to-speech-tts/overview) | `hume` | `HUME_API_KEY` |
| [Inworld](https://docs.inworld.ai/tts) | `inworld` | `INWORLD_API_KEY` |
| [Google Gemini TTS](https://docs.cloud.google.com/text-to-speech/docs/gemini-tts) | `google` | `GOOGLE_API_KEY` |
| [Fish Audio](https://docs.fish.audio) | `fish-audio` | `FISH_AUDIO_API_KEY` |
| [Murf](https://murf.ai/api/docs) | `murf` | `MURF_API_KEY` |
| [Resemble](https://docs.resemble.ai) | `resemble` | `RESEMBLE_API_KEY` |
| [fal](https://fal.ai/models) | `fal-ai` | `FAL_API_KEY` |
| [Mistral](https://docs.mistral.ai/capabilities/audio/text_to_speech/speech) | `mistral` | `MISTRAL_API_KEY` |
| [xAI](https://docs.x.ai/docs/models) | `xai` | `XAI_API_KEY` |

The env var applies when you call the provider directly via its factory. Pass a string `model` like `"openai/tts-1"` to route through Speech Gateway instead, which reads `SPEECHBASE_API_KEY` (or the legacy `SPEECH_GATEWAY_API_KEY`) — see [Gateway vs direct provider](#gateway-vs-direct-provider). Most providers ship a default model (`createOpenAI()()`); a few (e.g. fal) require an explicit model id. See the linked docs for each provider's full model list.

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

`generateConversation()` produces a single multi-voice clip from an ordered array of turns. The path is chosen by what the turns are:

- **Gateway** — every turn uses a gateway-routed string model (e.g. `"openai/tts-1"`). One request to Speech Gateway; the server handles rendering, stitching, and normalization. The SDK never stitches locally on this path — clone voices on gateway models throw `StitchUnsupportedError`.
- **Native dialogue** — every turn uses the same direct-provider model and that model exposes a multi-speaker endpoint. One API call, naturally mixed.
- **Stitch** — direct-provider conversations that don't qualify for native dialogue (multi-provider, or no dialogue endpoint). Runs turns in parallel, RMS-levels each, inserts silence, returns a single WAV.

Mixing gateway-routed turns with direct-provider turns in one call throws `MixedDispatchError`.

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

Options: `gapMs` (default 300), `volumeDbfs` (default `-20`), `maxConcurrency` (default 6), `maxRetries` (default 2), `timestamps`, `apiKey`, `providerOptions`, `abortSignal`, `headers`. Per-turn overrides: `model`, `providerOptions` (stitch path only — throws `ConversationInputError` on native). Native-dialogue models enforce their own voice-count and character limits; violations throw `DialogueConstraintError`.

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

Whether a given model returns native alignment or transcribes via the STT fallback is a provider detail — both paths produce the same `WordTimestamp[]` shape.

`generateConversation` accepts the same options and returns `ConversationWordTimestamp[]` — every word carries a `turnIndex: number` pointing back into the input `turns[]`. This is what lets you build chat-bubble UIs, speaker-attributed transcripts, and "who's speaking now?" lookups during playback without re-deriving turn boundaries.

```ts
import { generateConversation, timestampsToTurns } from '@speech-sdk/core';

const result = await generateConversation({
  model: 'elevenlabs/eleven_v3',
  turns: [
    { voice: 'rachel', text: 'Hi there.' },
    { voice: 'adam',   text: 'Hello!' },
  ],
  timestamps: true,
});

// Collapse consecutive words from the same turn into per-turn timings:
const turnTimestamps = timestampsToTurns(result.timestamps ?? []);
```

### Captions (SRT / WebVTT)

`timestampsToCaptions()` converts word-level timestamps into a caption file. SRT is the default; pass `format: 'vtt'` for WebVTT.

```ts
import { generateSpeech, timestampsToCaptions } from '@speech-sdk/core';

const { timestamps } = await generateSpeech({
  model: 'elevenlabs/eleven_v3',
  text: 'Hello world. This is a test.',
  voice: 'JBFqnCBsd6RMkjVDRZzb',
  timestamps: true,
});

const srt = timestampsToCaptions(timestamps ?? []);
const vtt = timestampsToCaptions(timestamps ?? [], { format: 'vtt' });
```

Cues break on sentence boundaries, then subdivide long sentences by character count, cue duration, and soft comma breaks. Pass `CaptionsOptions` to customize `format`, `maxLineLength`, `maxLinesPerCue`, `maxCharsPerCue`, `maxCueDurationMs`, or `longPhraseCommaBreakChars`.

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

### Output format

By default, `generateSpeech` preserves the provider or gateway response format.
`generateConversation` returns WAV when the SDK stitches direct-provider audio.

Pass `output` to request a specific final format:

```ts
const result = await generateSpeech({
  model: createOpenAI()('tts-1'),
  voice: 'alloy',
  text: 'Hello',
  output: { format: 'mp3', bitrate: 96 },
});

result.audio.mediaType; // "audio/mpeg"
```

Supported explicit formats are `wav`, `mp3`, and `pcm`.

For direct providers, the SDK first asks each provider whether it can natively produce the requested format. If yes, the provider returns it directly and the SDK passes the bytes through unchanged. If the provider can return WAV/PCM but not the requested format (e.g. ElevenLabs has no native WAV output, Cartesia has no native MP3), the SDK requests a decodable format and converts via mediabunny. The SDK never decodes compressed audio (mp3/opus/aac) — providers must return wav/pcm for any local conversion to succeed.

For gateway models, the SDK forwards `output` to the gateway API unchanged.

MP3 encoding uses [`@mediabunny/mp3-encoder`](https://mediabunny.dev/guide/extensions/mp3-encoder), loaded dynamically only when MP3 output is requested and the host environment does not already provide native MP3 encoding.

## Audio tags

Bracket syntax `[tag]` adds expressive cues. Each provider handles tags natively where supported, maps them to its closest equivalent, or strips them and surfaces a warning in `result.warnings`.

```ts
await generateSpeech({
  model: 'elevenlabs/eleven_v3',
  text: '[laugh] Oh that is so funny! [sigh] But seriously though.',
  voice: 'voice-id',
});
```

## Pronunciations

Customize how specific words are pronounced. Rules are applied as text substitution before the request is sent to the provider; word timestamps are inverse-mapped on return so the substitution is invisible to the caller.

```ts
import { generateSpeech } from '@speech-sdk/core';

await generateSpeech({
  model: 'openai/tts-1', // gateway path; or use createOpenAI()(...)
  voice: 'alloy',
  text: 'What is LLM?',
  pronunciations: {
    rules: [{ word: 'LLM', replacement: 'el el em' }],
  },
});
```

Stored dictionaries are referenced by ID and resolved server-side (gateway path only):

```ts
await generateSpeech({
  model: 'openai/tts-1',
  voice: 'alloy',
  text: 'What is LLM?',
  pronunciations: {
    dictionaryIds: ['dict_company_terms'],
    rules: [{ word: 'LLM', replacement: 'el el em' }], // overrides dict matches
  },
});
```

`dictionaryIds` requires the gateway path. On the direct-provider path, passing dictionary IDs throws `DictionaryIdsRequireGatewayError`. Inline `rules` work on both paths.

The same option is available on `streamSpeech` and `generateConversation`. On `generateConversation`, the option applies globally to every turn.

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
    error.retryAfterMs;  // parsed Retry-After header in ms (optional)
  }
}
```

`ApiError.code` is populated from the RFC 7807 `application/problem+json` `code` extension when the upstream provides one (currently only the Speech Gateway). Match on `err.code` over `err.message` text — codes are a stable contract, messages aren't.

| Error | When |
|---|---|
| `ApiError` | Provider returned non-2xx |
| `MissingApiKeyError` | No `apiKey` passed and the provider's env var is unset |
| `NoSpeechGeneratedError` | Empty input (after tag stripping) or empty provider response |
| `StreamingNotSupportedError` | `streamSpeech()` on a non-streaming model |
| `VolumeAdjustmentUnsupportedError` | `volumeDbfs` with no decodable output mode |
| `TimestampKeyMissingError` | `timestamps: true` with no native support, no `fallbackSTT` configured, and `OPENAI_API_KEY` not set |
| `ConversationInputError` / `DialogueConstraintError` / `StitchUnsupportedError` | `generateConversation` validation / native caps / stitch incompatibility |
| `SpeechSDKError` | Base class |

Retries 5xx (except 501), 429, and network errors with jittered exponential backoff ([p-retry](https://github.com/sindresorhus/p-retry)); other 4xx and 501 are terminal. When a retriable error carries a `Retry-After` header, the SDK sleeps that long before the next attempt — capped at 60s to avoid pathological waits. The parsed value is surfaced as `ApiError.retryAfterMs` whenever the header is present, even on terminal errors that aren't retried. Default 2 retries; override via `maxRetries`.

## Development

```bash
pnpm install
pnpm test              # unit tests
pnpm run test:e2e      # e2e tests (requires provider API keys)
pnpm run typecheck
pnpm fix               # format + lint
```

E2E tests hit real provider APIs. Set the relevant keys in `.env` or export them. Set `SPEECH_SDK_E2E_OUTPUT_DIR=~/Downloads/convos` to write conversation e2e audio to disk.
