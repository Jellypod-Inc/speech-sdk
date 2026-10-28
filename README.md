<div align="center">

<img src="https://github.com/user-attachments/assets/42d9b528-e507-4162-8120-338bb0c92650" alt="Speech SDK" width="140" />

# Speech SDK

**The Universal SDK for text-to-speech across all major providers**

A lightweight, provider-agnostic TypeScript SDK. Zero lock-in. Runs in Node.js, Edge runtimes, and the browser.

**Created and maintained by [Jellypod](https://jellypod.ai).**

[![npm version](https://img.shields.io/npm/v/@speech-sdk/core?style=flat-square)](https://www.npmjs.com/package/@speech-sdk/core)
[![npm downloads](https://img.shields.io/npm/dm/@speech-sdk/core?style=flat-square)](https://www.npmjs.com/package/@speech-sdk/core)
[![license](https://img.shields.io/npm/l/@speech-sdk/core?style=flat-square)](https://github.com/Jellypod-Inc/speech-sdk/blob/main/LICENSE)
[![Discord](https://img.shields.io/badge/Discord-Join-5865F2?style=flat-square&logo=discord&logoColor=white)](https://discord.gg/xcTQMU3nCV)
[![Stars](https://img.shields.io/github/stars/Jellypod-Inc/speech-sdk?style=flat-square&logo=github&label=stars)](https://github.com/Jellypod-Inc/speech-sdk/stargazers)

**[Docs](https://speechsdk.dev/)** · **[Quick start](#quick-start)** · **[Providers](#supported-providers)** · **[Streaming](#streaming)** · **[Conversations](#conversations)** · **[Timestamps](#timestamps)**

</div>

<br />

<img width="1200" height="630" alt="Speech SDK" src="https://github.com/user-attachments/assets/b90c0235-9405-4939-bffa-75fc82be5afb" />

## Features

- **Universal** — one `generateSpeech()` call across every supported provider.
- **Streaming** — `streamSpeech()` returns a standard `ReadableStream<Uint8Array>`.
- **Conversations** — `generateConversation()` produces multi-speaker audio from one or many providers.
- **Word-level timestamps** — native where available, forced alignment otherwise, plus SRT/WebVTT captions.
- **Audio tags, pronunciations, voice cloning & voice design** — handled per provider behind one API.
- **Output control** — volume normalization and `wav` / `mp3` / `pcm` output.

## Install

```bash
npm install @speech-sdk/core
```

> [!TIP]
> Using an AI coding assistant? Give it full knowledge of this library: `npx skills add Jellypod-Inc/speech-sdk --skill speech-sdk`.

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

Set the provider's env var (e.g. `OPENAI_API_KEY`) or pass `apiKey`. A bare provider id (`'openai'`) uses its default model.

Need a custom `baseURL`, `fetch`, or several configurations of one provider? Use a factory instead of a string:

```ts
import { createOpenAI } from '@speech-sdk/core/providers';

const openai = createOpenAI({ apiKey: 'sk-...', baseURL: 'https://my-proxy.com/v1' });

await generateSpeech({ model: openai('gpt-4o-mini-tts'), text: 'Hello!', voice: 'alloy' });
```

Use `instructions` for non-spoken delivery direction (`'warm and measured'`) on models that support it. Provider-specific parameters pass through untouched via `providerOptions`.

## Supported providers

| Provider | Prefix | Env var |
|---|---|---|
| [OpenAI](https://platform.openai.com/docs/guides/text-to-speech) | `openai` | `OPENAI_API_KEY` |
| [ElevenLabs](https://elevenlabs.io/docs) | `elevenlabs` | `ELEVENLABS_API_KEY` |
| [Google Gemini TTS](https://docs.cloud.google.com/text-to-speech/docs/gemini-tts) | `google` | `GOOGLE_API_KEY` |
| [Cartesia](https://docs.cartesia.ai) | `cartesia` | `CARTESIA_API_KEY` |
| [Deepgram](https://developers.deepgram.com/docs/text-to-speech) | `deepgram` | `DEEPGRAM_API_KEY` |
| [HeyGen](https://developers.heygen.com/docs/voices/heygen-voice-speech) | `heygen` | `HEYGEN_API_KEY` |
| [Hume](https://dev.hume.ai/docs/text-to-speech-tts/overview) | `hume` | `HUME_API_KEY` |
| [Inworld](https://docs.inworld.ai/tts) | `inworld` | `INWORLD_API_KEY` |
| [Fish Audio](https://docs.fish.audio) | `fish-audio` | `FISH_AUDIO_API_KEY` |
| [Gradium](https://docs.gradium.ai) | `gradium` | `GRADIUM_API_KEY` |
| [Murf](https://murf.ai/api/docs) | `murf` | `MURF_API_KEY` |
| [Resemble](https://docs.resemble.ai) | `resemble` | `RESEMBLE_API_KEY` |
| [fal](https://fal.ai/models) | `fal-ai` | `FAL_API_KEY` |
| [Mistral](https://docs.mistral.ai/capabilities/audio/text_to_speech/speech) | `mistral` | `MISTRAL_API_KEY` |
| [xAI](https://docs.x.ai/docs/models) | `xai` | `XAI_API_KEY` |
| [MiniMax](https://platform.minimax.io/docs/api-reference/speech-t2a-http) | `minimax` | `MINIMAX_API_KEY` |
| [Speechify](https://docs.speechify.ai) | `speechify` | `SPEECHIFY_API_KEY` |

Providers can also route through [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) with `createVercelAIGatewayClient()`. See the [docs](https://speechsdk.dev/) for per-provider models, voices, and caveats.

## Streaming

```ts
import { streamSpeech } from '@speech-sdk/core';

const { audio, mediaType } = await streamSpeech({
  model: 'cartesia/sonic-3.5',
  text: 'Streaming straight to the client.',
  voice: 'voice-id',
});

return new Response(audio, { headers: { 'Content-Type': mediaType } });
```

`streamConversation()` streams native two-speaker dialogue on models that support it (e.g. Gemini 3.8).

## Conversations

`generateConversation()` turns an ordered list of turns into one clip. Turns on a single multi-speaker model use its native dialogue endpoint; anything else is generated in parallel, level-matched, and stitched.

```ts
import { generateConversation } from '@speech-sdk/core';

const result = await generateConversation({
  turns: [
    { model: 'openai/tts-1',                      voice: 'nova',                 text: "Hi, I'm hosted by OpenAI." },
    { model: 'elevenlabs/eleven_multilingual_v2', voice: 'JBFqnCBsd6RMkjVDRZzb', text: "And I'm hosted by ElevenLabs." },
  ],
});

result.metadata.path; // 'native' | 'native-split' | 'stitch'
```

Pass `timestamps: true, splitTurns: true` to also get one sample-accurate clip per turn in `result.turns`.

## Timestamps

```ts
const result = await generateSpeech({
  model: 'elevenlabs/eleven_multilingual_v2',
  text: 'Hello from speech-sdk!',
  voice: 'JBFqnCBsd6RMkjVDRZzb',
  timestamps: true,
});

result.timestamps; // [{ text: 'Hello', start: 0.0, end: 0.32 }, ...] (seconds)
```

Models without native timestamps need a `timestampProvider`, such as `createElevenLabs().forcedAlignment()`. Timestamps never fail synthesis; `metadata.timestampsSource` reports `'native'`, `'aligned'`, or `'estimated'`.

Convert them to captions with `timestampsToCaptions(result.timestamps, { format: 'vtt' })` (SRT by default).

## More features

```ts
await generateSpeech({
  model: 'elevenlabs/eleven_v3',
  voice: 'voice-id',
  text: '[laugh] What is LLM?',                                        // audio tags
  pronunciations: { rules: [{ word: 'LLM', replacement: 'el el em' }] }, // pronunciations
  volumeDbfs: -20,                                                     // loudness normalization
  output: { format: 'mp3', bitrate: 96 },                              // wav | mp3 | pcm
});
```

- **Audio tags** — `[tag]` cues are passed natively, mapped, or stripped with a warning. Tags a voice reads aloud are detected and cut automatically.
- **Voice cloning** — pass `voice: { audio: base64 }` or `voice: { url }` on providers that support it.
- **Voice design** — `designVoice({ provider, name, description })` returns a reusable `voiceId`.

## Error handling

```ts
import { generateSpeech, SpeechSdkProviderError } from '@speech-sdk/core';

try {
  await generateSpeech({ /* ... */ });
} catch (error) {
  if (error instanceof SpeechSdkProviderError) {
    error.status;    // 401, 429, 500, ...
    error.code;      // stable provider error code
    error.retryable;
  }
}
```

5xx, 429, and network errors are retried with jittered exponential backoff (honoring `Retry-After`), 2 retries by default; override with `maxRetries`. All errors extend `SpeechSDKError`.

## Development

```bash
pnpm install
pnpm test              # unit tests
pnpm run test:e2e      # e2e tests (requires provider API keys)
pnpm run typecheck
pnpm fix               # format + lint
```

---

<div align="center">

Created and maintained by **[Jellypod](https://jellypod.ai)**.

</div>
