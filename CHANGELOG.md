# Changelog

## 0.22.0

- Add the exported, serializable `SpeechSdkProviderError` for provider non-2xx responses. It exposes `status`, `provider`, `model`, canonical `code`, the complete parsed provider body in `details`, unmodified response text in `rawResponse`, `requestId`, `retryable`, and optional `stage` (`synthesis` or `alignment`). `toJSON()` retains these fields for structured/serverless logging. The error extends `ApiError`, preserving `instanceof ApiError`, `statusCode`, `responseBody`, current summarized messages, retry timing, and turn attribution.
- **Google Gemini TTS `INVALID_ARGUMENT` responses now retain their complete `google.rpc.Status`.** Callers can inspect `BadRequest.fieldViolations`, `ErrorInfo.reason`, and metadata instead of receiving only `API error 400: Request contains an invalid argument.` The same structured error representation applies across direct providers and Speech Gateway responses; raw bodies are never truncated.

## 0.21.0

- Add the **Speechify** TTS provider (`speechify` prefix, `createSpeechify()` factory, `SPEECHIFY_API_KEY`). Ships three streaming models — `simba-english` (default, English), `simba-multilingual` (25 languages), and `simba-3.0` (English) — synthesizing at a fixed 48 kHz. `voice` is required and must be a Speechify `voice_id`. `generateSpeech` uses the `/audio/speech` JSON envelope (base64) and `streamSpeech` uses the raw-bytes `/audio/stream` route; `wav` and `mp3` are produced natively (`wav` is unavailable on the stream route, which defaults to `mp3`), and `pcm` is produced by decoding wav locally. Exposed via the `@speech-sdk/core/providers` subpath (`createSpeechify`).
- **Conversations with more unique voices than a native-dialogue provider supports now render via per-turn stitch instead of failing.** When a `generateConversation` request has more distinct voices than the provider's native multi-speaker limit (e.g. 3 voices on Google's `gemini-3.1-flash-tts-preview`, which supports exactly 2), the SDK now renders each turn as its own single-voice `generateSpeech` call and stitches them into one clip (honoring `gapMs` / `volumeDbfs` / `speed` / `output` / timestamps), with a warning that native multi-speaker dialogue was bypassed. Previously this threw `DialogueConstraintError`, which surfaced as a gateway 500. This supersedes the 0.19.0 behavior where the over-`maxVoices` case still threw — the fallback is now warned rather than silent. `DialogueConstraintError` remains exported but is no longer thrown by the conversation router. The two-or-fewer-distinct-voice native path and the gateway path are unchanged.
- **Fix: single-turn Gemini TTS rejected terse/conversational input with a 400.** Gemini's `generateContent` endpoint reads a bare short turn (e.g. "Hello there.") as a chat prompt and tries to *answer* it, which a TTS-only model rejects with `400 "Model tried to generate text, but it should only be used for TTS."`. `generateSpeech` / `streamSpeech` on the Google provider now frame the single-turn request as a read-aloud directive so Gemini voices the text verbatim instead of answering it — the documented Gemini TTS style-prompt form, where the instruction before the colon is delivery guidance and isn't spoken, so `text`, timestamps, and char-count/billing are unchanged. Longer inputs, the multi-speaker path, and the 3.1 `/interactions` streaming path are unchanged.

## 0.20.0

- Add **multi-provider voice design** via a new top-level `designVoice()` function. Pass a `provider` factory (e.g. `createElevenLabs()`), a `name`, and a natural-language `description` (plus optional `previewText`, `language`, `providerOptions`), and the SDK creates a brand-new synthetic voice on the provider, returning `{ voiceId, provider, preview?, warnings?, providerMetadata? }`. The returned `voiceId` is passed straight back as `voice` to `generateSpeech()`, and `preview` (`{ audio, mediaType }`) is a short sample of the designed voice. Design is provider-level — no model id is needed, and the voice works across all of that provider's models. Supported on seven providers — ElevenLabs, MiniMax, Fal, Hume, Inworld, Resemble, and Fish Audio — each marked with the `voice-design` capability (`FEATURES.VOICE_DESIGN`).
- The SDK absorbs each provider's underlying flow so callers always get one reusable id: single-call (MiniMax, Fal), design→persist (ElevenLabs, Hume, Inworld, Resemble), and design→clone (Fish Audio, whose `/v1/voice-design` is stateless — the SDK persists the candidate through Fish's clone endpoint).
- **Hume** custom voices are referenced by name under the `CUSTOM_VOICE` namespace. `generate()` gains a `providerOptions.voiceProvider` override (default `HUME_AI`) so designed/custom voices are usable; `designVoice()` returns a `warnings` entry reminding you to set it.
- **Resemble** voice design uses the public REST API (`app.resemble.ai/api/v2`), separate from its synthesis cluster — added an `appBaseURL` config option (`createResemble({ appBaseURL })`).
- Adds `VoiceDesignUnsupportedError` (thrown for providers without design support) and `InvalidDesignFieldError`. Design through the gateway provider is not supported.
- **Fix: Smallest AI clone and TTS endpoints were retired and returned `410 Gone`.** smallest.ai migrated off the `lightning-large` namespace, so both routes the provider used were dead: `cloneVoice()` posted to `https://waves-api.smallest.ai/api/v1/lightning-large/add_voice` and `generateSpeech()` posted to `https://api.smallest.ai/waves/v1/tts`, each returning `410 This model is retired. Please migrate to lightning-v3.1`. The provider now targets the live routes — TTS at `https://waves-api.smallest.ai/api/v1/lightning-v3.1/get_speech` (both `lightning_v3.1` and `lightning_v3.1_pro` are served here, with the variant selected by the `model` body field) and cloning at the model-agnostic `https://waves-api.smallest.ai/api/v1/voice-cloning` (multipart `displayName` + `file`, voice id read from `data.voiceId`). Clone and TTS now share one host, so a custom `baseURL` routes both. `get_speech` always responds with `Content-Type: audio/wav` even for `mp3`/`pcm`, so the SDK now derives the returned media type from the requested `output_format` instead of trusting the header. The default voice fallbacks (`magnus` for `lightning_v3.1`, `meher` for `lightning_v3.1_pro`) remain valid. Verified end-to-end against the live API: clone-then-generate returns `200` and produces playable WAV.

## 0.19.0

- **Single-speaker conversations no longer attempt native multi-speaker dialogue.** When every turn of a `generateConversation` request resolves to the same voice, the conversation is just sequential single-speaker speech — the SDK now renders it per-turn via `generateSpeech` and stitches the turns into one clip (respecting `gapMs` / `volumeDbfs` / `speed` / `output`) instead of routing into a provider's native dialogue path. Previously, native-dialogue providers that require multiple distinct voices (e.g. Google's `gemini-3.1-flash-tts-preview`, which requires exactly 2) threw `DialogueConstraintError` for a single-voice conversation, surfacing as a gateway 500. The two-or-more distinct-voice case is unchanged and still uses the native path; a conversation with **more** unique voices than a provider supports still throws `DialogueConstraintError` (no silent wrong-path fallback). Timestamps are honored on both paths. The gateway path is unchanged — the gateway server owns its own routing.
- **Breaking (provider authors): `dialogueCapabilities()` no longer returns `minVoices`.** Native dialogue is now universally defined as requiring 2+ distinct voices — a single voice is always sequential single-speaker speech routed to stitch — so the per-provider minimum is redundant. Providers declare only `{ maxVoices, maxTotalChars? }`. This affects only custom providers that implement `SpeechProvider.dialogueCapabilities`; all built-in providers are updated. No change for callers of `generateSpeech` / `generateConversation`.

## 0.18.2

- **Lower Gemini's native dialogue per-call budget from `5000` to `2500` characters.** Gemini TTS generation latency climbs with output length, so the previous budget produced slow first-audio on long conversations. Halving `dialogueCapabilities().maxTotalChars` for Google's Gemini TTS models means longer conversations are partitioned into more, shorter native-dialogue blocks that render in parallel and stitch together — faster than fewer long calls, with the same native multi-speaker sound. No API change; the gateway path is unchanged.

## 0.18.1

- **Long native dialogue is now rendered in parallel native-dialogue blocks instead of failing.** Native multi-speaker providers cap how much text one call can render (e.g. Gemini TTS shares a 32k-token window between input and generated audio). When a `generateConversation` request exceeds the provider's per-call limit, the SDK now keeps the native rendering: it partitions the turns into blocks at turn boundaries — each block under the limit and still satisfying the provider's unique-voice rule — renders each block as its own native-dialogue call **in parallel** (bounded by `maxConcurrency`), then RMS-normalizes and stitches the blocks into one file (`gapMs` applies at block seams only). Word timestamps are composed across blocks with `turnIndex` remapped to the global turn list. This improves latency for long conversations while preserving the native multi-speaker sound. The per-call budget is owned by each provider via `dialogueCapabilities().maxTotalChars`; Google's Gemini TTS models now declare one (`5000`). If a conversation can't be split into voice-valid blocks (a single turn longer than the limit, or a long single-speaker run on a two-voice model), it falls back to the local-stitch path with a warning. The gateway path is unchanged — the gateway server owns its own chunking.

## 0.18.0

- Add **instant voice cloning** via a new top-level `cloneVoice()` function. Pass a `provider` factory (e.g. `createElevenLabs()`), a `name`, and one or more audio `files` (raw `Uint8Array`, `{ audio, mediaType }`, or `{ url }`), and the SDK creates a reusable voice on the provider, returning `{ voiceId, provider, warnings?, providerMetadata? }`. The returned `voiceId` is passed straight back as `voice` to `generateSpeech()`. Cloning is provider-level — no model id is needed, and the voice works across all of that provider's models. Supported on nine providers — ElevenLabs, Cartesia, Fish Audio, Inworld, Mistral, xAI, Gradium, Smallest AI, and MiniMax — each marked with the `voice-cloning` capability on every model.
- **Breaking: removed inline voice cloning.** The `voice` field is now `string` only (a voice id) — `Voice` was `string | { url } | { audio }`. Only Mistral and fal ever honored the inline `{ audio }` / `{ url }` form; the other ~14 providers silently coerced the object into a string id and failed at runtime, so the type promised a feature that didn't exist. All voice cloning now goes through `cloneVoice()`, which returns a reusable `voiceId`. The `"inline-voice-cloning"` capability flag (`FEATURES.INLINE_VOICE_CLONING`) is removed accordingly.
- **Fix: ElevenLabs voice cloning targeted the wrong endpoint.** The instant-voice-clone request posted to `/voices/add` (missing the `/v1` prefix every other ElevenLabs endpoint uses), returning `404` against the live API. Now posts to `/v1/voices/add`.
- **Fix: MiniMax voice cloning sent `file_id` as a string.** MiniMax's `/voice_clone` returns the uploaded `file_id` as a JSON integer and rejects a stringified value with `2013 invalid params`. The SDK now echoes the int64 back un-stringified.
- Cloning through the gateway provider (`createSpeechGateway()`) is not supported yet and throws `VoiceCloningUnsupportedError`.

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
