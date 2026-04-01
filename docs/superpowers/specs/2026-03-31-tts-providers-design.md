# TTS Provider Expansion Design

Date: 2026-03-31

## Overview

Add 13 new TTS providers to `@jellypod/speech-sdk`, bringing the total to 15. Each provider follows the existing `SpeechProvider` pattern with API key auth, `baseURL`, and `fetch` config. The SDK abstracts away provider differences so users always call `generateSpeech({ model, voice, text })`.

## Voice Type Change

The `voice` parameter becomes a union type to support both named voices and reference audio cloning:

```ts
type Voice =
  | string                          // voice name or ID
  | { url: string }                 // reference audio URL for cloning
  | { audio: string | Uint8Array }  // reference audio data (base64 or bytes)
```

## Interface Changes

### SpeechProvider

Drop `TOptions` generic (providerOptions stays `Record<string, unknown>`), add `TVoice` generic for per-provider voice type safety:

```ts
interface SpeechProvider<
  TModel extends string = string,
  TVoice extends Voice = Voice,
> {
  id: string;
  defaultModel: TModel;
  models: readonly ModelInfo[];

  generate(options: {
    modelId: string;
    text: string;
    voice?: TVoice;
    providerOptions?: Record<string, unknown>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<{
    audio: string | Uint8Array;
    mediaType: string;
    providerMetadata?: Record<string, unknown>;
  }>;
}

interface ResolvedModel<TVoice extends Voice = Voice> {
  provider: SpeechProvider<string, TVoice>;
  modelId: string;
}
```

### generateSpeech

```ts
function generateSpeech<V extends Voice = Voice>(options: {
  model: string | ResolvedModel<V>;
  text: string;
  voice: V;
  providerOptions?: Record<string, unknown>;
  maxRetries?: number;
  abortSignal?: AbortSignal;
  headers?: Record<string, string>;
}): Promise<SpeechResult>
```

Factory functions give typed voice autocomplete. String models work but are untyped.

## Provider List

### Existing (no changes)

1. **OpenAI** — already implemented
2. **ElevenLabs** — already implemented

### New Providers

3. **Deepgram**
4. **Cartesia**
5. **LMNT**
6. **Hume**
7. **Google Cloud TTS**
8. **Speechify**
9. **Fish Audio**
10. **Unreal Speech**
11. **Murf.ai**
12. **Resemble.ai**
13. **WellSaid Labs**
14. **fal**
15. **Mistral (Voxtral)**

## Provider Architecture

Each provider follows the same file structure:

```
src/providers/<name>/
  ├── <name>-speech-model.ts    # implements SpeechProvider
  ├── <name>-provider.ts        # factory: create<Name>() → ResolvedModel
  ├── <name>-options.ts          # voice type export
  └── index.ts                   # re-exports
```

Every provider class accepts `{ apiKey?, baseURL?, fetch? }` in config and uses:
- `resolveApiKey()` from `provider-utils.ts` with the provider's env var
- `handleErrorResponse()` for error handling

No new runtime dependencies.

## Provider Mappings

### Deepgram

- **API Docs:** https://developers.deepgram.com/docs/text-to-speech
- **Models:** https://developers.deepgram.com/docs/tts-models
- **Endpoint:** `POST https://api.deepgram.com/v1/speak?model={modelId}-{voice}`
- **Auth:** `Authorization: Token <DEEPGRAM_API_KEY>`
- **Env Var:** `DEEPGRAM_API_KEY`
- **Default Model:** `aura-2`
- **Voice Mapping:** `voice` is appended to `modelId` with `-` separator in query param (e.g., `aura-2-thalia-en`)
- **Text Mapping:** `{ text }` in body
- **Response:** Binary audio stream
- **Voice Type:** `string` (e.g., `"thalia-en"`, `"sirio-es"`)

### Cartesia

- **API Docs:** https://docs.cartesia.ai/api-reference/tts/bytes
- **Endpoint:** `POST https://api.cartesia.ai/tts/bytes`
- **Auth:** `Authorization: Bearer <CARTESIA_API_KEY>` + `Cartesia-Version: 2025-04-16` header
- **Env Var:** `CARTESIA_API_KEY`
- **Default Model:** `sonic-2`
- **Voice Mapping:** `voice.id` in body (nested under `{ mode: "id", id: voice }`)
- **Text Mapping:** `transcript` in body
- **Response:** Binary audio stream

### LMNT

- **API Docs:** https://docs.lmnt.com/api-reference/speech/synthesize-speech
- **Endpoint:** `POST https://api.lmnt.com/v1/ai/speech/bytes`
- **Auth:** `X-API-Key: <LMNT_API_KEY>`
- **Env Var:** `LMNT_API_KEY`
- **Default Model:** `blizzard`
- **Voice Mapping:** `voice` in body
- **Text Mapping:** `text` in body
- **Response:** Binary audio stream

### Hume

- **API Docs:** https://dev.hume.ai/docs/text-to-speech-tts/overview
- **Endpoint:** `POST https://api.hume.ai/v0/tts/file`
- **Auth:** `X-Hume-Api-Key: <HUME_API_KEY>`
- **Env Var:** `HUME_API_KEY`
- **Default Model:** `octave-2` (maps to `version: 2` in body)
- **Voice Mapping:** `utterances[0].voice.name` in body
- **Text Mapping:** `utterances[0].text` in body
- **Response:** Binary audio stream (from `/v0/tts/file` endpoint)

### Google Cloud TTS

- **API Docs:** https://cloud.google.com/text-to-speech/docs/reference/rest/v1/text/synthesize
- **Endpoint:** `POST https://texttospeech.googleapis.com/v1/text:synthesize?key={apiKey}`
- **Auth:** API key as query param
- **Env Var:** `GOOGLE_API_KEY`
- **Default Model:** (voice-based, no model field — voice name like `en-US-Neural2-A` determines type)
- **Voice Mapping:** `voice.name` in body (also requires `voice.languageCode` derived from voice name prefix)
- **Text Mapping:** `input.text` in body
- **Response:** JSON `{ audioContent: "<base64>" }`

### Speechify

- **API Docs:** https://docs.sws.speechify.com/
- **Endpoint:** `POST https://api.speechify.ai/v1/audio/speech`
- **Auth:** `Authorization: Bearer <SPEECHIFY_API_KEY>`
- **Env Var:** `SPEECHIFY_API_KEY`
- **Default Model:** `simba-multilingual`
- **Voice Mapping:** `voice_id` in body
- **Text Mapping:** `input` in body
- **Response:** JSON `{ audio_data: "<base64>" }`

### Fish Audio

- **API Docs:** https://docs.fish.audio/developer-guide/core-features/text-to-speech
- **Endpoint:** `POST https://api.fish.audio/v1/tts`
- **Auth:** `Authorization: Bearer <FISH_AUDIO_API_KEY>`
- **Env Var:** `FISH_AUDIO_API_KEY`
- **Default Model:** `s2-pro`
- **Model Mapping:** `model` request header (not body)
- **Voice Mapping:** `reference_id` in body
- **Text Mapping:** `text` in body
- **Response:** Binary audio stream

### Unreal Speech

- **API Docs:** https://docs.v8.unrealspeech.com/
- **Endpoint:** `POST https://api.v8.unrealspeech.com/speech`
- **Auth:** `Authorization: Bearer <UNREAL_SPEECH_API_KEY>`
- **Env Var:** `UNREAL_SPEECH_API_KEY`
- **Default Model:** (single model, no selection)
- **Voice Mapping:** `VoiceId` in body
- **Text Mapping:** `Text` in body
- **Response:** JSON `{ OutputUri: "<s3-url>" }` — provider does a second fetch internally to download the MP3
- **Voice Type:** `'Scarlett' | 'Dan' | 'Liv' | 'Will' | 'Amy'`
- **Limits:** 3,000 characters per request

### Murf.ai

- **API Docs:** https://murf.ai/api/docs/api-reference/text-to-speech/generate
- **Endpoint:** `POST https://api.murf.ai/v1/speech/generate`
- **Auth:** `api-key: <MURF_API_KEY>` (custom header)
- **Env Var:** `MURF_API_KEY`
- **Default Model:** `GEN2`
- **Voice Mapping:** `voiceId` in body
- **Text Mapping:** `text` in body
- **Response:** JSON `{ encodedAudio: "<base64>" }` (provider injects `encodeAsBase64: true` in request)

### Resemble.ai

- **API Docs:** https://docs.resemble.ai/api-reference/text-to-speech/synthesize
- **Endpoint:** `POST https://f.cluster.resemble.ai/synthesize`
- **Auth:** `Authorization: Bearer <RESEMBLE_API_KEY>`
- **Env Var:** `RESEMBLE_API_KEY`
- **Default Model:** (default model)
- **Voice Mapping:** `voice_uuid` in body
- **Text Mapping:** `data` in body
- **Response:** JSON `{ audio_content: "<base64>" }`

### WellSaid Labs

- **API Docs:** https://docs.wellsaidlabs.com/reference/ttsstream
- **Endpoint:** `POST https://api.wellsaidlabs.com/v1/tts/stream`
- **Auth:** `X-Api-Key: <WELLSAID_API_KEY>`
- **Env Var:** `WELLSAID_API_KEY`
- **Default Model:** (single model, no selection)
- **Voice Mapping:** `speaker_id` in body
- **Text Mapping:** `text` in body
- **Response:** Binary audio stream (audio/mpeg)

### fal

- **API Docs:** https://fal.ai/models
- **Endpoint:** `POST https://fal.run/{modelId}`
- **Auth:** `Authorization: Key <FAL_API_KEY>`
- **Env Var:** `FAL_API_KEY`
- **Default Model:** (none — user must specify a full model ID like `fal-ai/inworld-tts`)
- **Voice Mapping:** `voice` in body (string) or mapped from `{ url }` voice type to model-specific field (e.g., `audio_url` for Chatterbox)
- **Text Mapping:** `text` in body
- **Provider Options:** Passed through directly to body — each fal model has a different schema
- **Response:** JSON `{ audio: { url: "<url>" } }` — provider does a second fetch to download audio
- **Voice Type:** `string | { url: string }`

### Mistral (Voxtral)

- **API Docs:** https://docs.mistral.ai/capabilities/audio/text_to_speech/speech
- **Endpoint:** `POST https://api.mistral.ai/v1/audio/speech`
- **Auth:** `Authorization: Bearer <MISTRAL_API_KEY>`
- **Env Var:** `MISTRAL_API_KEY`
- **Default Model:** `voxtral-mini-tts-2603`
- **Voice Mapping:** String voice → `voice_id` in body. `{ audio }` voice → `ref_audio` in body (base64).
- **Text Mapping:** `input` in body
- **Response:** JSON `{ audio_data: "<base64>" }`
- **Voice Type:** `string | { audio: string | Uint8Array }`

## resolve-provider.ts Changes

Add cases to `createBuiltinProvider()`:

```ts
case 'deepgram': return new DeepgramSpeechProvider({});
case 'cartesia': return new CartesiaSpeechProvider({});
case 'lmnt': return new LMNTSpeechProvider({});
case 'hume': return new HumeSpeechProvider({});
case 'google': return new GoogleSpeechProvider({});
case 'speechify': return new SpeechifySpeechProvider({});
case 'fish-audio': return new FishAudioSpeechProvider({});
case 'unreal-speech': return new UnrealSpeechProvider({});
case 'murf': return new MurfSpeechProvider({});
case 'resemble': return new ResembleSpeechProvider({});
case 'wellsaid': return new WellSaidSpeechProvider({});
case 'fal': return new FalSpeechProvider({});
case 'mistral': return new MistralSpeechProvider({});
```

## package.json Exports

Add subpath exports for each provider:

```json
"./deepgram": { "types": "./dist/providers/deepgram/index.d.ts", "default": "./dist/providers/deepgram/index.js" },
"./cartesia": { "types": "./dist/providers/cartesia/index.d.ts", "default": "./dist/providers/cartesia/index.js" },
"./lmnt": { "types": "./dist/providers/lmnt/index.d.ts", "default": "./dist/providers/lmnt/index.js" },
"./hume": { "types": "./dist/providers/hume/index.d.ts", "default": "./dist/providers/hume/index.js" },
"./google": { "types": "./dist/providers/google/index.d.ts", "default": "./dist/providers/google/index.js" },
"./speechify": { "types": "./dist/providers/speechify/index.d.ts", "default": "./dist/providers/speechify/index.js" },
"./fish-audio": { "types": "./dist/providers/fish-audio/index.d.ts", "default": "./dist/providers/fish-audio/index.js" },
"./unreal-speech": { "types": "./dist/providers/unreal-speech/index.d.ts", "default": "./dist/providers/unreal-speech/index.js" },
"./murf": { "types": "./dist/providers/murf/index.d.ts", "default": "./dist/providers/murf/index.js" },
"./resemble": { "types": "./dist/providers/resemble/index.d.ts", "default": "./dist/providers/resemble/index.js" },
"./wellsaid": { "types": "./dist/providers/wellsaid/index.d.ts", "default": "./dist/providers/wellsaid/index.js" },
"./fal": { "types": "./dist/providers/fal/index.d.ts", "default": "./dist/providers/fal/index.js" },
"./mistral": { "types": "./dist/providers/mistral/index.d.ts", "default": "./dist/providers/mistral/index.js" }
```

## Environment Variables

| Provider | Env Var |
|---|---|
| Deepgram | `DEEPGRAM_API_KEY` |
| Cartesia | `CARTESIA_API_KEY` |
| LMNT | `LMNT_API_KEY` |
| Hume | `HUME_API_KEY` |
| Google Cloud TTS | `GOOGLE_API_KEY` |
| Speechify | `SPEECHIFY_API_KEY` |
| Fish Audio | `FISH_AUDIO_API_KEY` |
| Unreal Speech | `UNREAL_SPEECH_API_KEY` |
| Murf.ai | `MURF_API_KEY` |
| Resemble.ai | `RESEMBLE_API_KEY` |
| WellSaid Labs | `WELLSAID_API_KEY` |
| fal | `FAL_API_KEY` |
| Mistral | `MISTRAL_API_KEY` |

## Testing Strategy

### Unit Tests

One test file per provider (`src/__tests__/<provider>.test.ts`):
- Mock `fetch` to return expected binary or JSON+base64 responses
- Verify correct URL construction, headers, and body
- Verify API key resolution from config and env var
- Verify error handling via `handleErrorResponse()`
- Provider-specific quirks:
  - Deepgram: model+voice composition in query param
  - Hume: utterances array wrapping
  - Google: voice config construction with languageCode
  - Unreal Speech: two-step fetch (JSON response then audio download)
  - fal: two-step fetch (JSON response then audio download)
  - Murf: `encodeAsBase64: true` injection
  - Fish Audio: model in request header
  - Cartesia: version header
  - Mistral: voice type dispatch (string → voice_id, object → ref_audio)

### E2E Tests

One test file per provider (`src/__tests__/e2e/<provider>.e2e.test.ts`):
- Hit real API, generate audio from short text
- Verify `Uint8Array` response with non-zero length
- Gated by env var availability (skip if key not set)
- Same pattern as existing `openai.e2e.test.ts` and `elevenlabs.e2e.test.ts`

No new test dependencies. No changes to vitest config.

## Decisions & Rationale

- **API key auth only** — complex auth (AWS SigV4, OAuth2) delegated to user via `fetch` option. Same pattern as Vercel AI SDK.
- **Azure cut** — redundant with OpenAI provider's `baseURL` option. AI SDK's Azure speech also just reuses OpenAI model.
- **PlayHT cut** — acquired by Meta, shut down Dec 31 2025.
- **AWS Polly cut** — no simple API key auth path.
- **providerOptions untyped** — `Record<string, unknown>` passthrough. Provider APIs change frequently; typed options create maintenance burden.
- **Voice typed per provider** — voice names are stable, worth typing for DX. Factory functions carry `TVoice` generic for autocomplete.
- **Binary and base64 responses both supported** — `DefaultGeneratedAudioFile` already handles both via lazy conversion.
- **Two-step fetch for URL responses** — Unreal Speech and fal return audio URLs. Provider downloads internally, invisible to caller.
- **Deepgram model+voice composition** — user passes `model: "deepgram/aura-2"`, `voice: "thalia-en"`, provider composes `aura-2-thalia-en` for the API query param.
- **fal passthrough** — each fal model has a different schema, so providerOptions are spread directly into the body. Provider handles voice type dispatch (string vs { url }).
