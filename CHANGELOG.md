# Changelog

## 0.8.3

- Parallel chunked text generation. When the SDK locally chunks text that exceeds a model's `maxInputChars`, chunk requests now fan out concurrently instead of running sequentially.
- New `GenerateSpeechOptions.maxConcurrency` (default `6`) caps the chunk fan-out. Set to `1` to serialize when a provider's account-level concurrency is the bottleneck. Ignored on the gateway path. Validated as a positive integer; throws on `NaN`/non-integer/non-positive values.
- `runStitch` (conversation path) forwards `maxConcurrency` into per-turn `generateSpeech` calls so chunked turns honor the same setting.
- On first chunk failure, in-flight sibling chunks are now aborted instead of running to completion with discarded results.

## 0.8.2

- Automatic text chunking when input exceeds a provider's `maxInputChars`. The SDK splits long text on sentence/word boundaries and concatenates the resulting audio.
- New per-request `moderationRulesetId` on the gateway path, forwarded to `api.speechgateway.com` for per-call moderation policy selection.

## 0.8.1

- Public subpath `./pronunciations` exposing `substitute`, `mergeRules`, `inverseAlign`, `ruleMapKey`, and types `Pronunciation`/`PronunciationsInput`/`Edit`.

## 0.8.0

- **Speech Gateway routing.** Bare `"provider/model"` strings now resolve to a built-in `SpeechGatewayProvider` that proxies requests to `api.speechgateway.com` using `SPEECH_GATEWAY_API_KEY`. Factory-based usage (`createOpenAI()("tts-1")`) continues to call providers directly. The gateway aggregates every built-in provider's models so capability checks work transparently.
- **Smallest AI Lightning TTS provider** added under `@speech-sdk/core/providers/smallest-ai`. (Thanks @harshitajain165 for the first contribution!)
- **Explicit audio output format.** `generateSpeech` and `generateConversation` now accept `output: "wav" | "mp3" | "pcm"`. The SDK requests the format natively from the provider when supported, and falls back to wav/pcm + local conversion via mediabunny otherwise. Compressed audio is never decoded client-side.
- **Pronunciations option** on `generateSpeech`, `streamSpeech`, and `generateConversation` for applying substitution rules to input text before synthesis.
- **Per-turn metadata** is now surfaced on the `generateConversation` stitch path so callers can inspect timing/duration/provider info per dialogue turn.
- **Retry-After aware retries.** 429 responses honor the server's `Retry-After` header with jittered backoff (WAV-83).
- **Timestamp fallback redesign** as part of the gateway routing work.
- CI: prereleases are now published to npm under the `next` dist-tag.

## 0.7.0

- **Word-level timestamps** on `generateSpeech` and `generateConversation`, with native alignment exposed across five providers and a graceful fallback for the rest.
- **`timestampsToCaptions`** helper for converting word-level timestamps into SRT and WebVTT output.
- License changed from MIT to **Apache-2.0**.
- Removed `dia-tts` and `chatterbox` models from the Fal provider; dropped the `inworld-tts` e2e test.

## 0.6.2

- `generateConversation` no longer caps dialogue at 4 voices.
- The native dialogue path now rejects per-turn `providerOptions`, since providers expect a single set of options for the whole multi-speaker request.

## 0.6.1

- All providers now send an `X-User-Agent: jellypod-speech-sdk` header so backends can identify SDK traffic.
- Configurable volume normalization on `generateSpeech` and `generateConversation`.
- Deepgram: `providerOptions` are now serialized into the query string (matching the Deepgram REST contract).
- Removed the `unreal-speech` provider.

## 0.6.0

- **`generateConversation`** — multi-speaker dialogue API. Uses native multi-speaker endpoints when the chosen provider supports them, and falls back to a stitch pipeline that synthesizes turns individually and concatenates the result.
- Refreshed the supported-language list for Gemini TTS.

## 0.5.2

- New **Inworld TTS provider** under `@speech-sdk/core/providers/inworld`. (Thanks @cshape for the first contribution!)
- Inworld provider sends an `X-User-Agent` header identifying the SDK.

## 0.5.1

- Audio-tag support for Google Gemini 3.1 Flash TTS.
- README badges; bundle-size badge removed.

## 0.5.0

- `generateSpeech` and `streamSpeech` now accept an optional `apiKey` argument, overriding the per-provider env var on a per-call basis.
- New **`SpeechMetadata`** on results, including request timing, audio duration, and provider info.
- Dependabot is now configured to group npm updates and ignore major-version bumps.

## 0.4.1

- xAI provider now reports language codes in ISO 639-1 format.
- Security: bumped Vite and enabled automated dependency updates.

## 0.4.0

- New **xAI TTS provider** under `@speech-sdk/core/providers/xai`.

## 0.3.0

- New **`streamSpeech()`** API for streaming audio from providers that support it.
- `ModelInfo` refactored: capabilities are now expressed as a `features` array instead of individual booleans. Capability checks throughout the SDK consume the new shape.

## 0.2.0

- OpenAI provider: bracketed audio tags (e.g. `[whispers]`) in the input text are mapped to `instructions` for `gpt-4o-mini-tts`.

## 0.1.0

- First minor release. API stabilization ahead of the 0.x feature line.

## 0.0.6

- Fix: bind `globalThis.fetch` so the SDK works correctly in browser environments where `fetch` is not bound to the global object.

## 0.0.5

- New `audioTags` field on `ModelInfo` to declare which providers/models support audio tags.
- Audio-tag support for Fish Audio.

## 0.0.4

- Initial **audio tag support** with per-provider processing.
- Audio-tag docs added; Husky removed from the dev toolchain.

## 0.0.3

- Added model metadata and refreshed the supported-language lists for all providers.

## 0.0.1

- Initial release as `@speech-sdk/core`.
