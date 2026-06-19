# Changelog

## 0.18.0

- Add **instant voice cloning** via a new top-level `cloneVoice()` function. Pass one or more audio `files` (raw `Uint8Array`, `{ audio, mediaType }`, or `{ url }`) plus a `name` and a factory-resolved `model`, and the SDK creates a reusable voice on the provider, returning `{ voiceId, provider, warnings?, providerMetadata? }`. The returned `voiceId` is passed straight back as `voice` to `generateSpeech()`. Supported on nine providers — ElevenLabs, Cartesia, Fish Audio, Inworld, Mistral, xAI, Gradium, Smallest AI, and MiniMax — each marked with the `voice-cloning` capability. The bare `"provider/model"` gateway-string path is not supported yet and throws `VoiceCloningUnsupportedError`.
- **Fix: ElevenLabs voice cloning targeted the wrong endpoint.** The instant-voice-clone request posted to `/voices/add` (missing the `/v1` prefix every other ElevenLabs endpoint uses), returning `404` against the live API. Now posts to `/v1/voices/add`.
- **Fix: MiniMax voice cloning sent `file_id` as a string.** MiniMax's `/voice_clone` returns the uploaded `file_id` as a JSON integer and rejects a stringified value with `2013 invalid params`. The SDK now echoes the int64 back un-stringified.

## 0.17.0

- **Real progressive streaming for `gemini-3.1-flash-tts-preview`.** `streamSpeech` on the Google provider now streams audio as it's generated via Gemini's `/interactions` endpoint (`stream: true`), decoding SSE `step.delta` events into raw 16-bit mono PCM at 24 kHz (`audio/pcm;rate=24000`). Previously `stream()` buffered the full clip through `:generateContent` and emitted it as a single chunk. The 2.5 TTS models keep the buffer-and-wrap single-chunk WAV fallback, as they have no progressive streaming endpoint.

## 0.16.0

- Add the **Gradium** TTS provider (`gradium` prefix, `createGradium()` factory, `GRADIUM_API_KEY`). Ships Gradium's `default` model with streaming support across English, French, German, Spanish, and Portuguese, and up to 20,000 input characters per request. Supports `wav` and `pcm` output natively at 8/16/22.05/24/44.1/48 kHz (default 48 kHz); `mp3` is produced by decoding Gradium's wav/pcm locally. The provider is registered in `aggregatedModels()` so `gradium/default` is discoverable through the gateway path.

## 0.15.1

- **Fix: gateway requests no longer send the legacy top-level `mode` discriminator.** The gateway's strict schemas reject the redundant key now that the server-side compatibility shim was removed, so every inline SDK request was failing with a root-level `400 invalid_input`. The key is dropped from all gateway request bodies, with a wire-shape regression test asserting it never returns.
- **Fix: close `AudioSample` instances in `decodeRawPcm` and `encodePcm16ToMp3`.** mediabunny no longer warns about samples being garbage collected while still open.

## 0.15.0

- **STT timestamp fallback now receives the synthesized source text.** When `generateSpeech` / `generateConversation` derive word timestamps via the STT fallback (a model with no native alignment), the SDK now passes the exact text it rendered as an optional `text` field on `SpeechToTextProvider.transcribe`. A fallback can use it to perform **forced alignment** (align known text → audio) instead of blind transcription. For conversations, `text` is the combined turn text (in turn order) matching the stitched audio; `turnIndex` attribution is unchanged. The field is optional everywhere and fully backward compatible — pure STT providers (the default OpenAI Whisper fallback included) ignore it and behave identically.

## 0.14.0

- **Breaking: removed `moderationRulesetId`.** This option only worked on the Speechbase gateway path and had no meaning for direct providers. The SDK is provider-neutral — nothing in it should require the Speechbase gateway — so it has been dropped along with the `ModerationRulesetIdRequiresGatewayError` it threw on direct-provider models. To override a moderation ruleset per request, call the Speechbase REST API directly.
- **Breaking: removed `pronunciations.dictionaryIds`.** Saved server-side pronunciation dictionaries were a gateway-only feature, so the option and its `DictionaryIdsRequireGatewayError` have been removed for the same provider-neutrality reason. Use the Speechbase REST API directly if you need stored dictionaries.
- **`pronunciations.rules` is unchanged.** Inline pronunciation rules continue to work on every provider — client-side text substitution on direct providers, server-side on the gateway — on `generateSpeech`, `streamSpeech`, and `generateConversation`.

## 0.13.0

- Add the **MiniMax** TTS provider (`minimax` prefix, `createMiniMax()` factory, `MINIMAX_API_KEY`). Ships MiniMax's current flagship T2A v2 models: `speech-2.8-hd` (default) and `speech-2.8-turbo`. The SDK decodes MiniMax's hex-encoded audio envelope, surfaces logical `base_resp` failures as `ApiError` (rate limits retried), and supports `wav` / `pcm` / `mp3` output at 8/16/22.05/24/32/44.1 kHz. `providerOptions` mirror the T2A request body (`voice_setting`, `audio_setting`, `language_boost`, …). Set `groupId` (or `MINIMAX_GROUP_ID`) for endpoints that require a Group ID.

## 0.12.0

- Add Cartesia `sonic-3.5` (`cartesia/sonic-3.5`), Cartesia's latest flagship TTS model. It carries the same capabilities as `sonic-3` — streaming, emotion/audio tags via SSML, inline voice cloning, and native word timestamps — across all 42 supported languages, and is a drop-in replacement for `sonic-3`.
- **Cartesia default model is now `sonic-3.5`** (previously `sonic-3`). Calls that omit the model id (`createCartesia()()` or the bare `"cartesia"` string) now resolve to `sonic-3.5`. Existing voice IDs and prompts work unchanged. Pin `cartesia/sonic-3` explicitly to keep the previous default.

## 0.11.1

- Gateway streaming now targets the dedicated `POST /v1/audio/speech/stream` endpoint instead of the buffered `POST /v1/audio/speech`. `streamSpeech` against the gateway returns true low-latency, chunk-by-chunk audio again; previously it degraded to a single un-chunked response. No public API change; non-streaming models still surface `StreamingNotSupportedError`.
- Gateway key resolution now reads `SPEECHBASE_API_KEY` first and falls back to `SPEECH_GATEWAY_API_KEY` for backward compatibility. An explicit `apiKey` option still wins over both. The missing-key / 401 error messages now reference `SPEECHBASE_API_KEY`.

## 0.11.0

- **Breaking: per-provider default sample rate raised.** Providers that natively support higher rates now default to their highest documented rate instead of 24 kHz: ElevenLabs, Cartesia, Deepgram Aura, Inworld, Murf, Fish Audio (44.1 kHz), and xAI. Stitch and chunk-stitch paths now use `max(per-segment rate)` instead of a 24 kHz constant. Single-rate providers (OpenAI 24 kHz, Google 24 kHz, Hume 48 kHz, Mistral 24 kHz, Resemble 44.1 kHz, Smallest-AI 24 kHz) declare their fixed rate and reject mismatches. Fal remains a pass-through with no rate selection.
  - **ElevenLabs free-tier callers** will see ElevenLabs reject PCM/WAV requests at ≥44.1 kHz. Pass `output: { format: "pcm", sampleRate: 24000 }` to keep the previous behavior.
- **New `output.sampleRate` option** on `AudioOutput`. Pass a positive integer to request a specific rate. Providers throw `UnsupportedSampleRateError` if the rate isn't in their documented set.
- **Fix: `volumeDbfs` no longer hard-clips transient consonants.** `normalizeRms` is now peak-aware: it caps the RMS-targeted gain so post-gain peaks stay ≤0.99 × INT16_MAX. If the source can't reach the requested RMS without clipping, the SDK preserves the source's dynamic range instead of distorting transients.
- New `UnsupportedSampleRateError` thrown when the caller requests a `sampleRate` the provider's API doesn't expose.
- **Fix: `output: { format: "mp3", sampleRate }` at 8/11.025/12 kHz no longer crashes the MP3 encoder.** The encoder now accepts the full MPEG-1/2/2.5 rate set; previously a low rate that passed provider validation threw deep in the local MP3-conversion (volume/chunk/conversation-stitch) path.
- **Fix: Fish Audio MP3 now validates `sampleRate` against its documented MP3 set (32 kHz / 44.1 kHz)** and forwards it, instead of silently dropping the requested rate; out-of-set rates throw `UnsupportedSampleRateError` like every other format.
- **Fix: Murf FALCON** declares its streaming-endpoint rate set (adds 16 kHz) separately from GEN2's `/speech/generate` set.
- **Fix: Fal** throws `UnsupportedSampleRateError` when a caller explicitly requests `output.sampleRate` (it has no rate selection) rather than silently returning audio at its native rate.
- **Fix: Resemble now forwards `sample_rate`.** Resemble's `/synthesize` accepts a documented `sample_rate` string enum (8/16/22.05/32/44.1/48 kHz); the SDK previously sent none and let the API pick an undocumented default (~32 kHz), so requested rates were ignored. It now declares the full set and forwards the chosen rate.
- **Fix: Murf FALCON `pcm` output.** FALCON's `generate`/`stream` derived mediaType from the response Content-Type (defaulting to `audio/wav`), mislabeling raw headerless PCM as WAV so it failed to decode. It now derives mediaType from the request like GEN2.
- Stitch and chunk-stitch now throw if no decoded segment carries a positive sample rate, instead of emitting a 0 Hz WAV.

## 0.10.1

- `generateConversation` no longer throws `ConversationInputError` when a turn carries `providerOptions` on a model that dispatches to native dialogue (e.g. `elevenlabs/eleven_v3`, Gemini multi-speaker). Dispatch falls through to the stitch path and surfaces a warning so callers can see they paid for extra API calls instead of one native call.

## 0.10.0

- Add `inworld-tts-2` model to the Inworld provider.

## 0.9.1

- Migrate gateway domain from `api.speechgateway.com` to `api.speechbase.ai`. The 401 / missing-key error messages now point to `https://speechbase.ai/` for signup. Public API names (`SpeechGatewayProvider`, `createSpeechGateway`, `SPEECH_GATEWAY_API_KEY`) are unchanged. Override `baseURL` on `createSpeechGateway` if you were pinning the old hostname explicitly.

## 0.9.0

- **`speed` parameter** on `generateSpeech` and `generateConversation` (range `0.75`–`1.5`). Direct providers time-stretch the audio locally and scale native timestamps and `audioDurationMs` by `1/speed`; the gateway path forwards `speed` in the wire payload so the gateway invariant is preserved.
- Conversation turns accept a per-turn `speed`. Per-turn `speed` forces the stitch path on direct providers; the gateway forwards both top-level and per-turn `speed`.
- New `@speech-sdk/core/plugins` subpath exposing `timeStretch`, a WSOLA-based mono PCM time-stretcher (the engine behind `speed`).
- When `speed` is set without an explicit `output`, the result is encoded as mp3 (matching what most providers return natively) instead of the wav/pcm intermediate the stretcher operates on.
- Avoid a wasted encode/decode round-trip when `speed` is active: the local post-processing step now defers output conversion to the time-stretch step, preserving quality on lossy formats.

## 0.8.3

- Parallel chunked text generation. When the SDK locally chunks text that exceeds a model's `maxInputChars`, chunk requests now fan out concurrently instead of running sequentially.
- New `GenerateSpeechOptions.maxConcurrency` (default `6`) caps the chunk fan-out. Set to `1` to serialize when a provider's account-level concurrency is the bottleneck. Ignored on the gateway path. Validated as a positive integer; throws on `NaN`/non-integer/non-positive values.
- `runStitch` (conversation path) forwards `maxConcurrency` into per-turn `generateSpeech` calls so chunked turns honor the same setting.
- On first chunk failure, in-flight sibling chunks are now aborted instead of running to completion with discarded results.

## 0.8.2

- Automatic text chunking when input exceeds a provider's `maxInputChars`. The SDK splits long text on sentence/word boundaries and concatenates the resulting audio.
- New per-request `moderationRulesetId` on the gateway path, forwarded to `api.speechbase.ai` for per-call moderation policy selection.

## 0.8.1

- Public subpath `./pronunciations` exposing `substitute`, `mergeRules`, `inverseAlign`, `ruleMapKey`, and types `Pronunciation`/`PronunciationsInput`/`Edit`.

## 0.8.0

- **Speech Gateway routing.** Bare `"provider/model"` strings now resolve to a built-in `SpeechGatewayProvider` that proxies requests to `api.speechbase.ai` using `SPEECH_GATEWAY_API_KEY`. Factory-based usage (`createOpenAI()("tts-1")`) continues to call providers directly. The gateway aggregates every built-in provider's models so capability checks work transparently.
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
