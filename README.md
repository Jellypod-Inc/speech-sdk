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

const result = await generateSpeech({
  model: 'openai/gpt-4o-mini-tts',
  text: 'Hello from speech-sdk!',
  voice: 'alloy',
});

// Access the audio
result.audio.uint8Array;  // Uint8Array
result.audio.base64;      // string (lazy-computed)
result.audio.mediaType;   // "audio/mpeg"
```

## Supported Providers

Use `provider/model` strings. Passing just the provider name uses its default model.

| Provider | String Prefix | Default Model | Env Var | Docs |
|---|---|---|---|---|
| [OpenAI](https://platform.openai.com/docs/guides/text-to-speech) | `openai` | `gpt-4o-mini-tts` | `OPENAI_API_KEY` | [API Reference](https://platform.openai.com/docs/api-reference/audio/createSpeech) |
| [ElevenLabs](https://elevenlabs.io/docs) | `elevenlabs` | `eleven_multilingual_v2` | `ELEVENLABS_API_KEY` | [API Reference](https://elevenlabs.io/docs/api-reference/text-to-speech/convert) |
| [Deepgram](https://developers.deepgram.com/docs/text-to-speech) | `deepgram` | `aura-2` | `DEEPGRAM_API_KEY` | [API Reference](https://developers.deepgram.com/docs/tts-models) |
| [Cartesia](https://docs.cartesia.ai) | `cartesia` | `sonic-3` | `CARTESIA_API_KEY` | [API Reference](https://docs.cartesia.ai/api-reference/tts/bytes) |
| [Hume](https://dev.hume.ai/docs/text-to-speech-tts/overview) | `hume` | `octave-2` | `HUME_API_KEY` | [API Reference](https://dev.hume.ai/reference/text-to-speech-tts/synthesize-json) |
| [Google (Gemini TTS)](https://docs.cloud.google.com/text-to-speech/docs/gemini-tts) | `google` | `gemini-2.5-flash-preview-tts` | `GOOGLE_API_KEY` | [API Reference](https://ai.google.dev/gemini-api/docs/text-generation) |
| [Fish Audio](https://docs.fish.audio) | `fish-audio` | `s2-pro` | `FISH_AUDIO_API_KEY` | [API Reference](https://docs.fish.audio/developer-guide/core-features/text-to-speech) |
| [Unreal Speech](https://docs.v8.unrealspeech.com) | `unreal-speech` | `default` | `UNREAL_SPEECH_API_KEY` | [API Reference](https://docs.v8.unrealspeech.com) |
| [Murf](https://murf.ai/api/docs) | `murf` | `GEN2` | `MURF_API_KEY` | [API Reference](https://murf.ai/api/docs/api-reference/text-to-speech/generate) |
| [Resemble](https://docs.resemble.ai) | `resemble` | `default` | `RESEMBLE_API_KEY` | [API Reference](https://docs.resemble.ai/api-reference/text-to-speech/synthesize) |
| [fal](https://fal.ai/models) | `fal` | *(user-specified)* | `FAL_API_KEY` | [API Reference](https://fal.ai/models) |
| [Mistral](https://docs.mistral.ai/capabilities/audio/text_to_speech/speech) | `mistral` | `voxtral-mini-tts-2603` | `MISTRAL_API_KEY` | [API Reference](https://docs.mistral.ai/capabilities/audio/text_to_speech/speech) |

```ts
generateSpeech({ model: 'openai/tts-1', text: '...', voice: 'alloy' });
generateSpeech({ model: 'elevenlabs/eleven_v3', text: '...', voice: 'voice-id' });
generateSpeech({ model: 'deepgram/aura-2', text: '...', voice: 'thalia-en' });
generateSpeech({ model: 'openai', text: '...', voice: 'alloy' });  // uses default model
```

Provider-specific API parameters can be passed via `providerOptions` — these are sent directly to the provider's API using the API's own field names.

## Custom Configuration

Use factory functions when you need custom API keys, base URLs, or fetch implementations:

```ts
import { generateSpeech } from '@jellypod/speech-sdk';
import { createOpenAI } from '@jellypod/speech-sdk/openai';
import { createElevenLabs } from '@jellypod/speech-sdk/elevenlabs';

const myOpenAI = createOpenAI({
  apiKey: 'sk-...',
  baseURL: 'https://my-proxy.com/v1',
});

const result = await generateSpeech({
  model: myOpenAI('gpt-4o-mini-tts'),
  text: 'Hello!',
  voice: 'alloy',
});
```

### API Key Resolution

When using string models (e.g., `'openai/tts-1'`), API keys are resolved from environment variables (see table above). Factory functions accept an explicit `apiKey` option which takes precedence.

## Voice Cloning

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
  model: string | ResolvedModel,  // required
  text: string,                   // required
  voice: Voice,                   // required
  providerOptions?: object,       // provider-specific API params
  maxRetries?: number,            // default: 2 (retries on 5xx/network errors)
  abortSignal?: AbortSignal,      // cancel the request
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
