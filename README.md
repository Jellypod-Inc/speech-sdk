# Speech SDK

Universal Text-To-Speech TypeScript SDK with Multi-Provider Support. Cross-platform (Node, Edge, Browser), Open-Source, and Minimal Dependencies.

## Install

```bash
npm install @jellypod/speech-sdk
```

### Using an AI Coding Assistant?

Add the speech-sdk skill to give your AI assistant full knowledge of this library:

```bash
npx skills add Jellypod-Inc/speech-sdk --skill use-speech-sdk
```

## Quick Start

```ts
import { generateSpeech } from '@jellypod/speech-sdk';
import { createOpenAI } from '@jellypod/speech-sdk/openai';

const openai = createOpenAI();

const result = await generateSpeech({
  model: openai('gpt-4o-mini-tts'),
  text: 'Hello from speech-sdk!',
  voice: 'alloy',
});

// Access the audio
result.audio.uint8Array;  // Uint8Array
result.audio.base64;      // string (lazy-computed)
result.audio.mediaType;   // "audio/mpeg"
```

## Supported Providers

| Provider | Import | Factory | Default Model | Env Var |
|---|---|---|---|---|
| OpenAI | `@jellypod/speech-sdk/openai` | `createOpenAI` | `gpt-4o-mini-tts` | `OPENAI_API_KEY` |
| ElevenLabs | `@jellypod/speech-sdk/elevenlabs` | `createElevenLabs` | `eleven_multilingual_v2` | `ELEVENLABS_API_KEY` |
| Deepgram | `@jellypod/speech-sdk/deepgram` | `createDeepgram` | `aura-2` | `DEEPGRAM_API_KEY` |
| Cartesia | `@jellypod/speech-sdk/cartesia` | `createCartesia` | `sonic-2` | `CARTESIA_API_KEY` |
| LMNT | `@jellypod/speech-sdk/lmnt` | `createLMNT` | `blizzard` | `LMNT_API_KEY` |
| Hume | `@jellypod/speech-sdk/hume` | `createHume` | `octave-2` | `HUME_API_KEY` |
| Google Cloud TTS | `@jellypod/speech-sdk/google` | `createGoogle` | `default` | `GOOGLE_API_KEY` |
| Speechify | `@jellypod/speech-sdk/speechify` | `createSpeechify` | `simba-multilingual` | `SPEECHIFY_API_KEY` |
| Fish Audio | `@jellypod/speech-sdk/fish-audio` | `createFishAudio` | `s2-pro` | `FISH_AUDIO_API_KEY` |
| Unreal Speech | `@jellypod/speech-sdk/unreal-speech` | `createUnrealSpeech` | `default` | `UNREAL_SPEECH_API_KEY` |
| Murf | `@jellypod/speech-sdk/murf` | `createMurf` | `GEN2` | `MURF_API_KEY` |
| Resemble | `@jellypod/speech-sdk/resemble` | `createResemble` | `default` | `RESEMBLE_API_KEY` |
| WellSaid Labs | `@jellypod/speech-sdk/wellsaid` | `createWellSaid` | `default` | `WELLSAID_API_KEY` |
| fal | `@jellypod/speech-sdk/fal` | `createFal` | *(user-specified)* | `FAL_API_KEY` |
| Mistral | `@jellypod/speech-sdk/mistral` | `createMistral` | `voxtral-mini-tts-2603` | `MISTRAL_API_KEY` |

## Usage

Create a provider instance with a factory function, then pass models to `generateSpeech`:

```ts
import { generateSpeech } from '@jellypod/speech-sdk';
import { createElevenLabs } from '@jellypod/speech-sdk/elevenlabs';

const elevenlabs = createElevenLabs();

const result = await generateSpeech({
  model: elevenlabs('eleven_v3'),
  text: 'Hello!',
  voice: 'JBFqnCBsd6RMkjVDRZzb',
});
```

### Custom Configuration

Pass custom API keys, base URLs, or fetch implementations to factory functions:

```ts
const openai = createOpenAI({
  apiKey: 'sk-...',
  baseURL: 'https://my-proxy.com/v1',
});

const elevenlabs = createElevenLabs({
  apiKey: '...',
  fetch: customFetch,
});
```

### Default Model

Call the factory without arguments to use the provider's default model:

```ts
const openai = createOpenAI();
const result = await generateSpeech({
  model: openai(), // uses gpt-4o-mini-tts
  text: 'Hello!',
  voice: 'alloy',
});
```

### API Key Resolution

API keys are resolved in order:
1. Explicit `apiKey` option passed to factory
2. Environment variable (see table above)

### Provider Options

Provider-specific API parameters can be passed via `providerOptions` — these are sent directly to the provider's API:

```ts
const result = await generateSpeech({
  model: openai('gpt-4o-mini-tts'),
  text: 'Hello!',
  voice: 'alloy',
  providerOptions: { speed: 1.5, response_format: 'opus' },
});
```

### Voice Cloning

Some providers support voice cloning via reference audio. Pass a voice object instead of a string:

```ts
import { createMistral } from '@jellypod/speech-sdk/mistral';

const mistral = createMistral();

// Clone from base64 audio
const result = await generateSpeech({
  model: mistral(),
  text: 'Hello!',
  voice: { audio: 'base64-encoded-audio...' },
});

// Clone from URL (fal)
import { createFal } from '@jellypod/speech-sdk/fal';

const fal = createFal();
const result = await generateSpeech({
  model: fal('fal-ai/chatterbox'),
  text: 'Hello!',
  voice: { url: 'https://example.com/reference.wav' },
});
```

## Options

```ts
generateSpeech({
  model: ResolvedModel,             // required — from a factory function
  text: string,                     // required
  voice: Voice,                     // required
  providerOptions?: object,         // provider-specific API params
  maxRetries?: number,              // default: 2 (retries on 5xx/network errors)
  abortSignal?: AbortSignal,        // cancel the request
  headers?: Record<string, string>, // additional HTTP headers
});
```

## Result

```ts
interface SpeechResult {
  audio: {
    uint8Array: Uint8Array;   // raw audio bytes
    base64: string;           // base64 encoded (lazy)
    mediaType: string;        // e.g. "audio/mpeg"
  };
  providerMetadata?: Record<string, unknown>;
}
```

## Error Handling

```ts
import { generateSpeech, ApiError, SpeechSDKError } from '@jellypod/speech-sdk';

try {
  const result = await generateSpeech({ ... });
} catch (error) {
  if (error instanceof ApiError) {
    console.log(error.statusCode);  // 401
    console.log(error.model);       // "openai/gpt-4o-mini-tts"
    console.log(error.responseBody);
  }
}
```

| Error | When |
|---|---|
| `ApiError` | Provider API returns a non-2xx response |
| `NoSpeechGeneratedError` | Provider returned empty audio |
| `SpeechSDKError` | Base class for all errors |

## Retry

Built-in retry with exponential backoff via [p-retry](https://github.com/sindresorhus/p-retry). Retries on 5xx and network errors. Does not retry 4xx errors. Default: 2 retries.

## Development

```bash
pnpm install
pnpm test                       # unit tests
pnpm run test:e2e               # e2e tests (requires API keys)
pnpm run typecheck              # type-check without emitting
```

E2E tests hit real provider APIs. Set the relevant API key environment variables in a `.env` file or export them in your shell.

## License

MIT
