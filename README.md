# Speech SDK

The Speech SDK is a lightweight, provider-agnostic TypeScript toolkit designed to help build text-to-speech powered applications using popular providers like OpenAI, ElevenLabs, Deepgram, Cartesia, Google, and more. Cross-platform (Node.js, Edge, Browser) with minimal dependencies.

To learn more about the Speech SDK, check out [https://speechsdk.dev/](https://speechsdk.dev/).

<img width="1200" height="630" alt="og-3" src="https://github.com/user-attachments/assets/b90c0235-9405-4939-bffa-75fc82be5afb" />


## Install

```bash
npm install @speech-sdk/core
```

### Using an AI Coding Assistant?

Add the speech-sdk skill to give your AI assistant full knowledge of this library:

```bash
npx skills add Jellypod-Inc/speech-sdk --skill speech-sdk
```

## Quick Start

```ts
import { generateSpeech } from '@speech-sdk/core';

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
| [fal](https://fal.ai/models) | `fal-ai` | *(user-specified)* | `FAL_API_KEY` | [API Reference](https://fal.ai/models) |
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
import { generateSpeech } from '@speech-sdk/core';
import { createOpenAI } from '@speech-sdk/core/openai';
import { createElevenLabs } from '@speech-sdk/core/elevenlabs';

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

## Audio Tags

Use bracket syntax `[tag]` to add expressive audio cues like laughter, sighs, or emotions. Provider support varies — unsupported tags are automatically stripped with warnings returned in `result.warnings`.

```ts
const result = await generateSpeech({
  model: 'elevenlabs/eleven_v3',
  text: '[laugh] Oh that is so funny! [sigh] But seriously though.',
  voice: 'voice-id',
});

console.log(result.warnings); // undefined — eleven_v3 supports all tags
```

### Provider behavior

| Provider | Behavior |
|---|---|
| ElevenLabs (`eleven_v3`) | All `[tag]` passed through natively |
| Cartesia (`sonic-3`) | Emotion tags (`[happy]`, `[sad]`, `[angry]`, etc.) converted to SSML; `[laughter]` passed through; unknown tags stripped |
| All others | Tags stripped and warnings returned |

```ts
// Unsupported provider — tags are stripped with warnings
const result = await generateSpeech({
  model: 'openai/gpt-4o-mini-tts',
  text: '[laugh] Hello world',
  voice: 'alloy',
});

console.log(result.warnings);
// ["Audio tag [laugh] is not supported by openai/gpt-4o-mini-tts and was removed."]
```

## Voice Cloning

Some providers support voice cloning via reference audio. Pass a voice object instead of a string:

```ts
import { createMistral } from '@speech-sdk/core/mistral';

const mistral = createMistral();

// Clone from base64 audio
const result = await generateSpeech({
  model: mistral(),
  text: 'Hello!',
  voice: { audio: 'base64-encoded-audio...' },
});
```

Clone from a URL (fal):

```ts
import { createFal } from '@speech-sdk/core/fal-ai';

const fal = createFal();
const result = await generateSpeech({
  model: fal('fal-ai/chatterbox'),
  text: 'Hello!',
  voice: { url: 'https://example.com/reference.wav' },
});
```

## Symbol Expansion

By default, the SDK automatically expands numbers and currency symbols into spoken words before sending text to the TTS provider. This improves pronunciation quality across languages.

```ts
// Numbers and currency are expanded automatically
await generateSpeech({
  model: 'openai/gpt-4o-mini-tts',
  text: 'I bought 3 apples for $4.50',
  voice: 'alloy',
});
// Provider receives: "I bought three apples for four dollars and fifty cents"
```

Language is auto-detected from the input text using [tinyld](https://github.com/nicedoc/tinyld), and numbers are expanded in the detected locale using [to-words](https://github.com/mhrdwan/to-words):

```ts
// French text is detected and expanded with French number words
await generateSpeech({
  model: 'openai/gpt-4o-mini-tts',
  text: "J'ai acheté 3 pommes pour 4,50€",
  voice: 'alloy',
  options: { symbolExpansion: true, locale: 'fr-FR' }, // or let it auto-detect
});
```

**What gets expanded:** plain integers (`42`), grouped numbers (`1,000,000`), decimals (`3.14`), currency (`$50`, `50€`), and English ordinals (`3rd`).

**What stays unchanged:** identifiers (`B747`, `H2O`) and ranges (`50-100`).

To disable expansion:

```ts
await generateSpeech({
  model: 'openai/gpt-4o-mini-tts',
  text: 'Flight B747 departs at gate 3',
  voice: 'alloy',
  options: { symbolExpansion: false },
});
```

## Options

```ts
generateSpeech({
  model: string | ResolvedModel,  // required
  text: string,                   // required
  voice: Voice,                   // required
  options?: SpeechOptions,        // SDK-level options (see below)
  providerOptions?: object,       // provider-specific API params
  maxRetries?: number,            // default: 2 (retries on 5xx/network errors)
  abortSignal?: AbortSignal,      // cancel the request
  headers?: Record<string, string>, // additional HTTP headers
});
```

### `SpeechOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `symbolExpansion` | `boolean` | `true` | Expand numbers and currency into spoken words |
| `locale` | `string` | auto-detected | Override locale for expansion (e.g. `'de-DE'`). Only valid when `symbolExpansion` is `true`. |

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
import { generateSpeech, ApiError, SpeechSDKError } from '@speech-sdk/core';

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
