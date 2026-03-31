---
name: use-speech-sdk
description: "How to use the speech-sdk library for text-to-speech generation with multiple providers (OpenAI, ElevenLabs). Use this skill whenever the user wants to generate speech audio, convert text to speech, work with TTS providers, use generateSpeech, or integrate speech-sdk into their application. Also trigger when you see imports from 'speech-sdk', 'speech-sdk/openai', or 'speech-sdk/elevenlabs' in the codebase."
---

# speech-sdk

A TypeScript SDK for text-to-speech with multiple provider support. Universal (Node, Edge, Browser).

## Core API

One function: `generateSpeech`. It takes a model string, text, voice, and returns audio.

```ts
import { generateSpeech } from 'speech-sdk';

const result = await generateSpeech({
  model: 'openai/gpt-4o-mini-tts',
  text: 'Hello from speech-sdk!',
  voice: 'alloy',
});

result.audio.uint8Array;  // Uint8Array — raw audio bytes
result.audio.base64;      // string — lazy-computed base64
result.audio.mediaType;   // "audio/mpeg"
```

## Model Strings

Use `provider/model-id` format. Passing just the provider name uses its default model.

### OpenAI

Default model: `gpt-4o-mini-tts`

```ts
generateSpeech({ model: 'openai/gpt-4o-mini-tts', text: '...', voice: 'alloy' });
generateSpeech({ model: 'openai/tts-1', text: '...', voice: 'nova' });
generateSpeech({ model: 'openai/tts-1-hd', text: '...', voice: 'echo' });
generateSpeech({ model: 'openai', text: '...', voice: 'alloy' }); // uses default
```

### ElevenLabs

Default model: `eleven_multilingual_v2`

```ts
generateSpeech({ model: 'elevenlabs/eleven_v3', text: '...', voice: 'voice-id' });
generateSpeech({ model: 'elevenlabs/eleven_multilingual_v2', text: '...', voice: 'voice-id' });
generateSpeech({ model: 'elevenlabs/eleven_flash_v2_5', text: '...', voice: 'voice-id' });
generateSpeech({ model: 'elevenlabs/eleven_flash_v2', text: '...', voice: 'voice-id' });
generateSpeech({ model: 'elevenlabs', text: '...', voice: 'voice-id' }); // uses default
```

## Function Signature

All fields on `generateSpeech`:

```ts
generateSpeech({
  model: string | ResolvedModel,  // required — 'openai/tts-1' or factory result
  text: string,                   // required — text to convert
  voice: string,                  // required — voice ID or name
  providerOptions?: object,       // provider-specific API params (passed through directly)
  maxRetries?: number,            // default: 2 (retries on 5xx/network errors only)
  abortSignal?: AbortSignal,      // cancel the request
  headers?: Record<string, string>, // additional HTTP headers
});
```

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
import { generateSpeech } from 'speech-sdk';
import { createOpenAI } from 'speech-sdk/openai';
import { createElevenLabs } from 'speech-sdk/elevenlabs';

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

### API Key Resolution

When using string models, keys are read from environment variables:
- OpenAI: `OPENAI_API_KEY`
- ElevenLabs: `ELEVENLABS_API_KEY`

Factory functions with explicit `apiKey` take precedence over env vars.

## Error Handling

Three error types, all extending `SpeechSDKError`:

```ts
import { generateSpeech, ApiError, NoSpeechGeneratedError, SpeechSDKError } from 'speech-sdk';

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
- `src/speech-provider.ts` — `SpeechProvider` interface that all providers implement
- `src/speech-result.ts` — `SpeechResult` and `DefaultGeneratedAudioFile` with lazy conversion
- `src/provider-utils.ts` — shared `resolveApiKey()` and `handleErrorResponse()`
- `src/errors.ts` — `SpeechSDKError`, `ApiError`, `NoSpeechGeneratedError`
- `src/providers/openai/` — OpenAI provider implementation
- `src/providers/elevenlabs/` — ElevenLabs provider implementation

Adding a new provider means:
1. Create `src/providers/<name>/<name>-speech-model.ts` implementing `SpeechProvider`
2. Create `src/providers/<name>/<name>-provider.ts` with a `create<Name>()` factory
3. Add a case to `createBuiltinProvider()` in `resolve-provider.ts`
4. Add subpath export to `package.json`
