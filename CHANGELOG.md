# Changelog

## 0.8.0 (2026-04-23)

### Features

- **`generateConversation` gateway fast-path.** When every turn routes through the same Speech Gateway string model (`"elevenlabs/eleven_v3"`, `"openai/gpt-4o-mini-tts"`, etc.), the SDK now makes a single `POST /v1/audio/conversation` call instead of N client-side stitched requests. The server handles per-turn rendering, stitching, and normalization — including for providers without native multi-speaker endpoints. Faster, and skips pulling `pcm-concat` / `audio-utils` / `mediabunny` into the bundle for gateway users. Voice clones (`{url}` / `{audio}` voice shapes) still route to the existing stitch path. Allow-by-default: any gateway-routed model takes the fast-path.
- **`ConversationWordTimestamp` type** — word-level timestamps on `generateConversation` now carry a required `turnIndex: number` so callers can attribute each word to the turn that produced it. Trivial to build chat-bubble UIs, speaker-attributed captions, and "who's speaking right now?" lookups during playback without re-deriving turn boundaries. Stitch path emits `turnIndex` directly; native dialogue path derives it via greedy text-matching against per-turn input; gateway returns it (future).
- **`ConversationResult`** — `generateConversation` now returns a narrower result type with `timestamps?: readonly ConversationWordTimestamp[]` (extends `SpeechResult` via `Omit`). Backward-compatible via structural typing.
- **`ApiError.code`** — when a provider returns `application/problem+json` (RFC 7807) with a `code` extension field, the SDK surfaces it as `error.code` for programmatic matching. Speech Gateway sets stable codes like `"timestamps_unsupported"` on 501s, `"no_api_key"`, `"provider_disabled"`, `"unknown_provider"`, `"upstream_error"`, `"conversation_input_invalid"` on 400/401s. Match on `err.code` rather than parsing `err.message`.
- **HTTP 501 treated as non-retriable** in the shared retry config. `isRetriableApiError()` helper exported from `provider-utils` for consistency across `generateSpeech`, `streamSpeech`, and `generateConversation`.

### New errors

- `ConversationTimestampAttributionError` — thrown on the native dialogue path when greedy text-matching attribution can't reliably place words on turns (TTS dropped/inserted >20% of words, or confidence below threshold). Prefer `timestamps: "off"`, or switch to a model that routes through stitch (which has exact per-turn attribution).

### Breaking changes

None at the public API level. Additive-only: existing `generateSpeech` / `streamSpeech` / `generateConversation` callers need no changes. The `generateConversation` return type has narrowed from `SpeechResult` to `ConversationResult`, but `ConversationResult extends Omit<SpeechResult, "timestamps">` with a compatible narrower `timestamps` field — structural typing preserves all existing code paths.

### Internal refactors

- `SpeechProvider.generate()` options no longer carry gateway-only `timestamps` / `volumeDbfs` fields. Type predicate `isSpeechGatewayModel(resolved)` narrows to the concrete `SpeechGatewayProvider` class which exposes the wider signature.
- `aggregatedModels()` no longer instantiates 13 provider classes on first call. Each provider now exports its model metadata as module-level constants (`<NAME>_PROVIDER_ID` / `<NAME>_MODELS`); the gateway reads these directly.

## 1.0.0 (2026-03-30)

Initial release — full rewrite from Python to TypeScript.

### Features

- `generateSpeech()` function with unified model strings (`openai/tts-1`, `elevenlabs/eleven_multilingual_v2`)
- OpenAI provider (`createOpenAI`) — default model `gpt-4o-mini-tts`
- ElevenLabs provider (`createElevenLabs`) — default model `eleven_multilingual_v2`, request stitching via `providerOptions`
- Type-safe provider options validated with Zod
- `GeneratedAudioFile` with lazy `base64`/`uint8Array` conversion
- Built-in retry via `p-retry` (skips 4xx, retries 5xx/network errors)
- Factory functions for custom API keys, base URLs, and fetch implementations
- Subpath exports: `speech-sdk/openai`, `speech-sdk/elevenlabs`
- Universal target (Node, Edge, Browser)
