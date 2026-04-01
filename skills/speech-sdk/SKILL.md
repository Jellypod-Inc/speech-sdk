---
name: speech-sdk
description: "How to use @speech-sdk/core for text-to-speech generation with 12 providers (OpenAI, ElevenLabs, Deepgram, Cartesia, Hume, Google, Fish Audio, Unreal Speech, Murf, Resemble, fal, Mistral). Use this skill whenever the user wants to generate speech audio, convert text to speech, work with TTS providers, use generateSpeech, or integrate speech-sdk into their application. Also trigger when you see imports from '@speech-sdk/core' or related subpath imports in the codebase."
---

# @speech-sdk/core

Universal TypeScript TTS SDK with multi-provider support. Cross-platform (Node, Edge, Browser).

## Install

```bash
npm install @speech-sdk/core
```

## Core API

One function: `generateSpeech`. It takes a model string, text, voice, and returns audio.

```ts
import { generateSpeech } from '@speech-sdk/core';

const result = await generateSpeech({
  model: 'openai/gpt-4o-mini-tts',
  text: 'Hello from speech-sdk!',
  voice: 'alloy',
});

result.audio.uint8Array;  // Uint8Array — raw audio bytes
result.audio.base64;      // string — lazy-computed base64
result.audio.mediaType;   // "audio/mpeg"
```

## Supported Providers

Use `provider/model-id` format. Passing just the provider name uses its default model.

| Provider | String Prefix | Default Model | Env Var |
|---|---|---|---|
| OpenAI | `openai` | `gpt-4o-mini-tts` | `OPENAI_API_KEY` |
| ElevenLabs | `elevenlabs` | `eleven_multilingual_v2` | `ELEVENLABS_API_KEY` |
| Deepgram | `deepgram` | `aura-2` | `DEEPGRAM_API_KEY` |
| Cartesia | `cartesia` | `sonic-3` | `CARTESIA_API_KEY` |
| Hume | `hume` | `octave-2` | `HUME_API_KEY` |
| Google (Gemini TTS) | `google` | `gemini-2.5-flash-preview-tts` | `GOOGLE_API_KEY` |
| Fish Audio | `fish-audio` | `s2-pro` | `FISH_AUDIO_API_KEY` |
| Unreal Speech | `unreal-speech` | `default` | `UNREAL_SPEECH_API_KEY` |
| Murf | `murf` | `GEN2` | `MURF_API_KEY` |
| Resemble | `resemble` | `default` | `RESEMBLE_API_KEY` |
| fal | `fal-ai` | *(user-specified)* | `FAL_API_KEY` |
| Mistral | `mistral` | `voxtral-mini-tts-2603` | `MISTRAL_API_KEY` |

```ts
generateSpeech({ model: 'openai/gpt-4o-mini-tts', text: '...', voice: 'alloy' });
generateSpeech({ model: 'elevenlabs/eleven_v3', text: '...', voice: 'voice-id' });
generateSpeech({ model: 'deepgram/aura-2', text: '...', voice: 'thalia-en' });
generateSpeech({ model: 'cartesia/sonic-3', text: '...', voice: 'voice-id' });
generateSpeech({ model: 'hume/octave-2', text: '...', voice: 'voice-name' });
generateSpeech({ model: 'google', text: '...', voice: 'Kore' });
generateSpeech({ model: 'fish-audio/s2-pro', text: '...', voice: 'voice-id' });
generateSpeech({ model: 'murf/GEN2', text: '...', voice: 'en-US-natalie' });
generateSpeech({ model: 'mistral/voxtral-mini-tts-2603', text: '...', voice: 'jessica' });
generateSpeech({ model: 'openai', text: '...', voice: 'alloy' }); // uses default model
```

## Function Signature

```ts
generateSpeech({
  model: string | ResolvedModel,  // required — 'openai/tts-1' or factory result
  text: string,                   // required — text to convert
  voice: Voice,                   // required — string ID, { url } or { audio } for cloning
  providerOptions?: object,       // provider-specific API params (passed through directly)
  maxRetries?: number,            // default: 2 (retries on 5xx/network errors only)
  abortSignal?: AbortSignal,      // cancel the request
  headers?: Record<string, string>, // additional HTTP headers
});
```

### Voice Type

The `voice` field accepts three forms:

```ts
type Voice =
  | string                          // voice ID or name (all providers)
  | { url: string }                 // reference audio URL (fal)
  | { audio: string | Uint8Array }  // inline reference audio (Mistral)
```

Most providers use a string voice ID. Mistral and fal support instant voice cloning by passing reference audio inline — no voice is saved, it just mimics the reference for that generation.

## Result Shape

```ts
interface SpeechResult {
  audio: GeneratedAudioFile;
  providerMetadata?: Record<string, unknown>;
}

interface GeneratedAudioFile {
  uint8Array: Uint8Array;  // raw audio bytes
  base64: string;          // base64 encoded (lazy-computed)
  mediaType: string;       // e.g. "audio/mpeg"
}
```

## Provider Options

These are passed directly to the provider's API using the API's own field names. No transformation happens — what you pass is what gets sent.

### OpenAI providerOptions

```ts
generateSpeech({
  model: 'openai/gpt-4o-mini-tts',
  text: 'Hello!',
  voice: 'alloy',
  providerOptions: {
    speed: 1.5,                        // 0.25 to 4.0
    instructions: 'Speak cheerfully',  // gpt-4o-mini-tts only
    response_format: 'wav',            // mp3, opus, aac, flac, wav, pcm
  },
});
```

### ElevenLabs providerOptions

Body params are spread into the request body. Query params (`output_format`, `enable_logging`, `optimize_streaming_latency`) are extracted and sent as URL query parameters.

```ts
generateSpeech({
  model: 'elevenlabs/eleven_multilingual_v2',
  text: 'Hello!',
  voice: 'your-voice-id',
  providerOptions: {
    // Body params (sent in request body)
    voice_settings: { stability: 0.5, similarity_boost: 0.8 },
    language_code: 'en',
    previous_request_ids: ['req-abc'],
    next_request_ids: ['req-def'],
    previous_text: 'Previous paragraph...',
    next_text: 'Next paragraph...',
    seed: 42,
    apply_text_normalization: 'auto',  // 'auto' | 'on' | 'off'

    // Query params (sent as URL params)
    output_format: 'mp3_44100_192',
    enable_logging: false,
    optimize_streaming_latency: 2,
  },
});
```

### ElevenLabs Request Stitching

For multi-segment audio with continuity, use `previous_request_ids` from `providerMetadata`:

```ts
const first = await generateSpeech({
  model: 'elevenlabs/eleven_multilingual_v2',
  text: 'First paragraph...',
  voice: 'voice-id',
});

const second = await generateSpeech({
  model: 'elevenlabs/eleven_multilingual_v2',
  text: 'Second paragraph...',
  voice: 'voice-id',
  providerOptions: {
    previous_request_ids: [first.providerMetadata?.requestId],
  },
});
```

## Custom Configuration (Factory Functions)

When you need custom API keys, base URLs, or fetch implementations, use factory functions instead of string models:

```ts
import { generateSpeech } from '@speech-sdk/core';
import { createOpenAI } from '@speech-sdk/core/openai';
import { createElevenLabs } from '@speech-sdk/core/elevenlabs';

const myOpenAI = createOpenAI({
  apiKey: 'sk-...',                    // explicit key (overrides env var)
  baseURL: 'https://my-proxy.com/v1', // custom endpoint
  fetch: customFetchFn,               // custom fetch implementation
});

const result = await generateSpeech({
  model: myOpenAI('gpt-4o-mini-tts'),  // returns a ResolvedModel
  text: 'Hello!',
  voice: 'alloy',
});
```

### Factory Subpath Imports

Each provider has a factory function available via subpath import:

| Import | Factory |
|---|---|
| `@speech-sdk/core/openai` | `createOpenAI` |
| `@speech-sdk/core/elevenlabs` | `createElevenLabs` |
| `@speech-sdk/core/deepgram` | `createDeepgram` |
| `@speech-sdk/core/cartesia` | `createCartesia` |
| `@speech-sdk/core/hume` | `createHume` |
| `@speech-sdk/core/google` | `createGoogle` |
| `@speech-sdk/core/fish-audio` | `createFishAudio` |
| `@speech-sdk/core/unreal-speech` | `createUnrealSpeech` |
| `@speech-sdk/core/murf` | `createMurf` |
| `@speech-sdk/core/resemble` | `createResemble` |
| `@speech-sdk/core/fal-ai` | `createFal` |
| `@speech-sdk/core/mistral` | `createMistral` |

### API Key Resolution

When using string models, keys are read from environment variables (see Supported Providers table above). Factory functions with explicit `apiKey` take precedence over env vars.

## Voice Cloning

Some providers support instant voice cloning via reference audio. Pass a voice object instead of a string — no voice is saved, it just mimics the reference for that generation.

```ts
import { createMistral } from '@speech-sdk/core/mistral';

const mistral = createMistral();

// Clone from inline base64 audio
const result = await generateSpeech({
  model: mistral(),
  text: 'Hello!',
  voice: { audio: 'base64-encoded-audio...' },
});
```

```ts
import { createFal } from '@speech-sdk/core/fal-ai';

const fal = createFal();

// Clone from a reference audio URL
const result = await generateSpeech({
  model: fal('fal-ai/chatterbox'),
  text: 'Hello!',
  voice: { url: 'https://example.com/reference.wav' },
});
```

## Error Handling

Three error types, all extending `SpeechSDKError`:

```ts
import { generateSpeech, ApiError, NoSpeechGeneratedError, SpeechSDKError } from '@speech-sdk/core';

try {
  const result = await generateSpeech({ ... });
} catch (error) {
  if (error instanceof ApiError) {
    error.statusCode;    // HTTP status code
    error.model;         // e.g. "openai/gpt-4o-mini-tts"
    error.responseBody;  // raw response from the API
  }
  if (error instanceof NoSpeechGeneratedError) {
    // provider returned empty audio
  }
}
```

## Common Patterns

### Save audio to file (Node.js)

```ts
import { writeFile } from 'fs/promises';

const result = await generateSpeech({
  model: 'openai/gpt-4o-mini-tts',
  text: 'Hello world',
  voice: 'alloy',
});

await writeFile('output.mp3', result.audio.uint8Array);
```

### Return audio from an API endpoint

```ts
const result = await generateSpeech({
  model: 'openai/gpt-4o-mini-tts',
  text: 'Hello world',
  voice: 'alloy',
});

return new Response(result.audio.uint8Array, {
  headers: { 'Content-Type': result.audio.mediaType },
});
```

### Cancel a request

```ts
const controller = new AbortController();
setTimeout(() => controller.abort(), 5000);

const result = await generateSpeech({
  model: 'openai/tts-1',
  text: 'Hello world',
  voice: 'alloy',
  abortSignal: controller.signal,
});
```

## Architecture Notes

For contributors working on the library itself:

- `src/generate-speech.ts` — public `generateSpeech()` function
- `src/resolve-provider.ts` — parses `provider/model` strings, instantiates built-in providers
- `src/speech-provider.ts` — `SpeechProvider` interface, `Voice` type, `ResolvedModel`
- `src/speech-result.ts` — `SpeechResult` and `DefaultGeneratedAudioFile` with lazy conversion
- `src/provider-utils.ts` — shared `resolveApiKey()` and `handleErrorResponse()`
- `src/errors.ts` — `SpeechSDKError`, `ApiError`, `NoSpeechGeneratedError`
- `src/providers/<name>/index.ts` — each provider in a single consolidated file

Adding a new provider means:
1. Create `src/providers/<name>/index.ts` implementing `SpeechProvider`
2. Add a case to `createBuiltinProvider()` in `resolve-provider.ts`
3. Add subpath export to `package.json`
