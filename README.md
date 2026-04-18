# Speech SDK

[![npm version](https://img.shields.io/npm/v/@speech-sdk/core)](https://www.npmjs.com/package/@speech-sdk/core)
[![npm downloads](https://img.shields.io/npm/dm/@speech-sdk/core)](https://www.npmjs.com/package/@speech-sdk/core)
[![license](https://img.shields.io/npm/l/@speech-sdk/core)](https://github.com/Jellypod-Inc/speech-sdk/blob/main/LICENSE)

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

## Streaming

Use `streamSpeech()` instead of `generateSpeech()` to receive audio bytes incrementally as the provider produces them. The result's `audio` field is a standard `ReadableStream<Uint8Array>` that works in Node, Edge runtimes, and browsers.

```ts
import { streamSpeech } from "@speech-sdk/core";

const { audio, mediaType } = await streamSpeech({
  model: "openai/tts-1",
  text: "Hello from the speech SDK!",
  voice: "alloy",
});
```

### Pipe to a file (Node)

```ts
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";

const { audio } = await streamSpeech({
  model: "elevenlabs/eleven_flash_v2_5",
  text: "Hello world",
  voice: "JBFqnCBsd6RMkjVDRZzb",
});

await new Promise((resolve, reject) => {
  Readable.fromWeb(audio).pipe(createWriteStream("out.mp3")).on("finish", resolve).on("error", reject);
});
```

### Forward to an HTTP response (Edge / Workers / Next.js Route Handler)

```ts
export async function GET() {
  const { audio, mediaType } = await streamSpeech({
    model: "cartesia/sonic-3",
    text: "Streaming straight to the client.",
    voice: "voice-id",
  });

  return new Response(audio, { headers: { "Content-Type": mediaType } });
}
```

### Read chunks manually

```ts
const reader = audio.getReader();
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  // value is a Uint8Array of audio bytes
}
```

### Capability check

Check whether a model supports streaming before calling `streamSpeech()`:

```ts
import { hasFeature } from "@speech-sdk/core";

const model = provider.models.find((m) => m.id === "tts-1");
if (hasFeature(model, "streaming")) {
  // safe to call streamSpeech()
}
```

Calling `streamSpeech()` on a model that doesn't declare the `"streaming"` feature throws `StreamingNotSupportedError`.

### Errors and retries

Retries apply only to the initial request, until response headers arrive. Once bytes start flowing, mid-stream errors propagate to the `ReadableStream` consumer as a stream error and are not retried. Pass `maxRetries` (default `2`) and an `abortSignal` the same way as `generateSpeech()`.

## Conversations

`generateConversation()` produces a single multi-voice audio clip from an ordered array of turns. It picks the best path automatically:

- **Native dialogue** — when every turn shares one model and that provider has a real multi-speaker dialogue endpoint, the SDK makes a single API call and returns the provider's natural mix. Works with **ElevenLabs v3**, **Google Gemini TTS** (exactly 2 voices), **Hume Octave**, **Fish Audio S2-Pro**, and **fal Dia**.
- **Stitch fallback** — when turns span multiple providers, or the chosen model has no native dialogue endpoint, the SDK calls `generateSpeech()` per turn in parallel, normalizes each result to PCM, RMS-levels them so quieter providers don't get drowned out, inserts a configurable silence between turns, and returns a single WAV.

```ts
import { generateConversation } from "@speech-sdk/core/conversation";

const result = await generateConversation({
  turns: [
    { model: "openai/tts-1", voice: "nova", text: "Hi, I'm hosted by OpenAI." },
    { model: "elevenlabs/eleven_multilingual_v2", voice: "JBFqnCBsd6RMkjVDRZzb", text: "And I'm hosted by ElevenLabs." },
    { model: "google/gemini-3.1-flash-tts-preview", voice: "Kore", text: "I'm Gemini three-point-one flash TTS." },
    { model: "hume/octave-2", voice: "Kora", text: "And I'm Hume Octave. Thanks for listening." },
  ],
});

result.audio.uint8Array;  // Uint8Array of one combined WAV
result.audio.mediaType;   // "audio/wav"
```

The return type is the standard `SpeechResult`, so it composes with everything else in the SDK.

### Try it — listen to the difference

The same four-provider conversation rendered two ways. The raw version exposes the natural mismatch between providers (Hume Octave is noticeably quieter than ElevenLabs or OpenAI); the normalized version (the default) levels every voice to a fixed −20 dBFS RMS target — the broadcast/podcast voice convention.

**Cross-provider stitch** (OpenAI + ElevenLabs):

<video controls src="https://github.com/user-attachments/files/26859347/assets_audio_conversation_cross-provider-stitch.mp3"></video>

**Four-provider stitch — raw** (`normalizeVolume: false`):

<video controls src="https://github.com/user-attachments/files/26859345/four-providers-conversation-raw.wav"></video>

**Four-provider stitch — normalized** (default):

<video controls src="https://github.com/user-attachments/files/26859349/four-providers-conversation-normalized.wav"></video>

### Conversation options

```ts
generateConversation({
  model?: string | ResolvedModel,                 // default model for all turns
  turns: ConversationTurn[],                      // 1..N turns; up to 4 unique voices
  gapMs?: number,                                 // silence between turns (stitch path), default 300
  normalizeVolume?: boolean,                      // RMS-level stitched turns, default true
  maxConcurrency?: number,                        // cap parallel generateSpeech calls, default 6
  maxRetries?: number,                            // per-turn retries, default 2
  apiKey?: string,
  providerOptions?: Record<string, unknown>,      // forwarded to every provider; per-turn override available
  abortSignal?: AbortSignal,
  headers?: Record<string, string>,
});

interface ConversationTurn {
  voice: Voice;                                   // required
  text: string;                                   // required, non-empty
  model?: string | ResolvedModel;                 // per-turn override of the top-level model
  providerOptions?: Record<string, unknown>;
}
```

### Volume normalization

When the stitch path runs, `normalizeVolume: true` (the default) RMS-normalizes each per-turn segment to a fixed **−20 dBFS** RMS target — the broadcast/podcast voice convention, with ~20 dB peak headroom so typical TTS speech doesn't clip after gain. The target is absolute, not relative, so:

- Two `generateConversation` calls produce comparable loudness even with completely different content — you can play them back-to-back without adjusting volume.
- Each segment is normalized independently — no cross-segment dependency, just two O(N) passes over the int16 PCM samples per segment.

Pass `normalizeVolume: false` to skip the step entirely (zero work) when you want raw provider levels.

### Errors

Conversation-specific errors (importable from `@speech-sdk/core/conversation/errors`):

| Error | When |
|---|---|
| `ConversationInputError` | Validation failure — empty turns, blank text, more than 4 unique voices, or a turn missing a model |
| `DialogueConstraintError` | A native-dialogue provider was selected but the conversation violates its constraints (e.g. 3 voices on Gemini, which requires exactly 2) |
| `StitchUnsupportedError` | The stitch path was selected but a chosen provider/model can't emit PCM/WAV (currently `unreal-speech`, `fal-ai`, `mistral`) |

### Native dialogue caps

| Provider | Native dialogue model | Voice constraints |
|---|---|---|
| ElevenLabs | `eleven_v3` | 1–10 voices, ≤ 2,000 total chars |
| Google | `gemini-2.5-flash-preview-tts`, `gemini-2.5-pro-preview-tts`, `gemini-3.1-flash-tts-preview` | **Exactly 2 voices** (API requirement) |
| Hume | `octave-1`, `octave-2` | 1–4 voices |
| Fish Audio | `s2-pro` | 1–4 voices |
| fal | `dia-tts` | 1–2 voices |

Across the SDK, conversations are capped at **4 unique voices** total regardless of provider.

## Supported Providers

Use `provider/model` strings. Passing just the provider name uses its default model.

| Provider | String Prefix | Default Model | Env Var | Docs |
|---|---|---|---|---|
| [OpenAI](https://platform.openai.com/docs/guides/text-to-speech) | `openai` | `gpt-4o-mini-tts` | `OPENAI_API_KEY` | [API Reference](https://platform.openai.com/docs/api-reference/audio/createSpeech) |
| [ElevenLabs](https://elevenlabs.io/docs) | `elevenlabs` | `eleven_multilingual_v2` | `ELEVENLABS_API_KEY` | [API Reference](https://elevenlabs.io/docs/api-reference/text-to-speech/convert) |
| [Deepgram](https://developers.deepgram.com/docs/text-to-speech) | `deepgram` | `aura-2` | `DEEPGRAM_API_KEY` | [API Reference](https://developers.deepgram.com/docs/tts-models) |
| [Cartesia](https://docs.cartesia.ai) | `cartesia` | `sonic-3` | `CARTESIA_API_KEY` | [API Reference](https://docs.cartesia.ai/api-reference/tts/bytes) |
| [Hume](https://dev.hume.ai/docs/text-to-speech-tts/overview) | `hume` | `octave-2` | `HUME_API_KEY` | [API Reference](https://dev.hume.ai/reference/text-to-speech-tts/synthesize-json) |
| [Inworld](https://docs.inworld.ai/tts) | `inworld` | `inworld-tts-1.5-max` | `INWORLD_API_KEY` | [API Reference](https://docs.inworld.ai/tts/api-reference) |
| [Google (Gemini TTS)](https://docs.cloud.google.com/text-to-speech/docs/gemini-tts) | `google` | `gemini-2.5-flash-preview-tts` | `GOOGLE_API_KEY` | [API Reference](https://ai.google.dev/gemini-api/docs/text-generation) |
| [Fish Audio](https://docs.fish.audio) | `fish-audio` | `s2-pro` | `FISH_AUDIO_API_KEY` | [API Reference](https://docs.fish.audio/developer-guide/core-features/text-to-speech) |
| [Unreal Speech](https://docs.v8.unrealspeech.com) | `unreal-speech` | `default` | `UNREAL_SPEECH_API_KEY` | [API Reference](https://docs.v8.unrealspeech.com) |
| [Murf](https://murf.ai/api/docs) | `murf` | `GEN2` | `MURF_API_KEY` | [API Reference](https://murf.ai/api/docs/api-reference/text-to-speech/generate) |
| [Resemble](https://docs.resemble.ai) | `resemble` | `default` | `RESEMBLE_API_KEY` | [API Reference](https://docs.resemble.ai/api-reference/text-to-speech/synthesize) |
| [fal](https://fal.ai/models) | `fal-ai` | *(user-specified)* | `FAL_API_KEY` | [API Reference](https://fal.ai/models) |
| [Mistral](https://docs.mistral.ai/capabilities/audio/text_to_speech/speech) | `mistral` | `voxtral-mini-tts-2603` | `MISTRAL_API_KEY` | [API Reference](https://docs.mistral.ai/capabilities/audio/text_to_speech/speech) |
| [xAI](https://docs.x.ai/docs/models) | `xai` | `grok-tts` | `XAI_API_KEY` | [API Reference](https://docs.x.ai/docs/api-reference#text-to-speech) |

```ts
generateSpeech({ model: 'openai/tts-1', text: '...', voice: 'alloy' });
generateSpeech({ model: 'elevenlabs/eleven_v3', text: '...', voice: 'voice-id' });
generateSpeech({ model: 'deepgram/aura-2', text: '...', voice: 'thalia-en' });
generateSpeech({ model: 'inworld/inworld-tts-1.5-max', text: '...', voice: 'Ashley' });
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
| OpenAI (`gpt-4o-mini-tts`) | Tags mapped to the `instructions` field for expressive delivery control |
| ElevenLabs (`eleven_v3`) | All `[tag]` passed through natively |
| Google (`gemini-3.1-flash-tts-preview`) | All `[tag]` passed through natively (e.g. `[whispers]`, `[shouting]`, `[sighs]`, `[laugh]`) |
| Cartesia (`sonic-3`) | Emotion tags (`[happy]`, `[sad]`, `[angry]`, etc.) converted to SSML; `[laughter]` passed through; unknown tags stripped |
| All others | Tags stripped and warnings returned |

```ts
// OpenAI gpt-4o-mini-tts — tags are mapped to the `instructions` field
const result = await generateSpeech({
  model: 'openai/gpt-4o-mini-tts',
  text: '[cheerfully] Hi John how are you? [soft] I\'m feeling great',
  voice: 'alloy',
});
// Sent to OpenAI:
//   input: "Hi John how are you? I'm feeling great"
//   instructions: "Delivery shifts through the text in order: begin cheerfully, then soft."
console.log(result.warnings); // undefined
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
