# Speech SDK

Universal Text-To-Speech TypeScript SDK with Multi-Provider Support (ElevenLabs, OpenAI, and more). Cross-platform (Node, Edge, Browser), Open-Source, and Minimal Dependencies.

## Install

```bash
npm install @Jellypod-Inc/speech-sdk
```

### Using an AI Coding Assistant?

Add the speech-sdk skill to give your AI assistant full knowledge of this library:

```bash
npx skills add Jellypod-Inc/speech-sdk --skill use-speech-sdk
```

## Quick Start

```ts
import { generateSpeech } from 'speech-sdk';

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

Use unified `provider/model` strings. Passing just the provider name uses its default model.

| Provider | Model String | Default |
|---|---|---|
| OpenAI | `openai/gpt-4o-mini-tts` | Yes |
| OpenAI | `openai/tts-1` | |
| OpenAI | `openai/tts-1-hd` | |
| ElevenLabs | `elevenlabs/eleven_v3` | |
| ElevenLabs | `elevenlabs/eleven_multilingual_v2` | Yes |
| ElevenLabs | `elevenlabs/eleven_flash_v2_5` | |
| ElevenLabs | `elevenlabs/eleven_flash_v2` | |

```ts
generateSpeech({ model: 'openai/tts-1', text: '...', voice: 'alloy' });
generateSpeech({ model: 'openai', text: '...', voice: 'alloy' });       // uses default model
```

Provider-specific API parameters can be passed via `providerOptions` — these are sent directly to the provider's API using the API's own field names.

## Custom Configuration

Use factory functions when you need custom API keys, base URLs, or fetch implementations:

```ts
import { generateSpeech } from 'speech-sdk';
import { createOpenAI } from 'speech-sdk/openai';
import { createElevenLabs } from 'speech-sdk/elevenlabs';

const myOpenAI = createOpenAI({
  apiKey: 'sk-...',
  baseURL: 'https://my-proxy.com/v1',
});

const myElevenLabs = createElevenLabs({
  apiKey: '...',
  baseURL: 'https://my-proxy.com',
});

const result = await generateSpeech({
  model: myOpenAI('gpt-4o-mini-tts'),
  text: 'Hello!',
  voice: 'alloy',
});
```

### API Key Resolution

When using string models (e.g., `'openai/tts-1'`), API keys are resolved from environment variables:

| Provider | Environment Variable |
|---|---|
| OpenAI | `OPENAI_API_KEY` |
| ElevenLabs | `ELEVENLABS_API_KEY` |

Factory functions accept an explicit `apiKey` option which takes precedence over environment variables.

## Options

```ts
generateSpeech({
  model: string | ResolvedModel,  // required
  text: string,                   // required
  voice: string,                  // required
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
import { generateSpeech, ApiError, SpeechSDKError } from 'speech-sdk';

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
pnpm run test:e2e               # all e2e tests (requires API keys)
pnpm run test:e2e openai        # only OpenAI e2e tests
pnpm run test:e2e elevenlabs    # only ElevenLabs e2e tests
```

E2E tests hit real provider APIs. Set `OPENAI_API_KEY` and `ELEVENLABS_API_KEY` in a `.env` file at the project root, or export them in your shell.

## License

MIT
