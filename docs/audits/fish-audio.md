# Fish Audio integration audit

Audit of `src/providers/fish-audio/index.ts` against Fish Audio's public TTS API.

- **Date:** 2026-05-15
- **SDK version audited:** 0.10.0
- **Endpoint:** `POST https://api.fish.audio/v1/tts`
- **API spec sources:** see [Sources](#sources)

## Summary

The integration is largely correct against the spec. Endpoint, auth, model header,
voice → `reference_id` mapping, S2-Pro multi-speaker dialogue (`<|speaker:i|>` tags +
array `reference_id`), and the wav/mp3/pcm output mapping all match what Fish documents.
Three real gaps and one latent trap are listed below.

## Gaps

### 1. Only `s2-pro` is registered; `s1` is missing

`FISH_AUDIO_MODELS` declares one model. Fish's public cloud API also exposes `s1`
(OpenAudio S1) selected via the same `model:` header. Callers can already reach
`s1` by passing `"s1"` as the model id (the header is just `options.modelId`), but
they lose:

- `languages` and `features` metadata
- the `audio-tags` capability check in `processAudioTags`
- gateway aggregation in `src/providers/gateway/index.ts`

Note that S1 uses a different emotion syntax — fixed-set `(parens)` like `(happy)`,
`(excited)`, etc. — not the free-form `[brackets]` that S2-Pro accepts. If S1 is
registered with `audio-tags` in `features`, the existing `stripAudioTags` helper
(`src/audio-tags.ts`) will be wrong for the disabled path, since it only strips
brackets. See [§4](#4-audio-tag-stripping-is-bracket-only-pre-existing) below.

### 2. `inline-voice-cloning` feature flag is advertised but unreachable

s2-pro's `features` array includes `inline-voice-cloning`, but `generate()` /
`stream()` only translate `voice: string` → `reference_id`. Fish's spec supports
zero-shot cloning via `references: list[{audio: bytes, text: str}]`. Today, a
caller has to drop down to `providerOptions: { references: [...] }` to use it,
which means the feature flag promises something the SDK can't surface in a
typed way.

Two ways out:

- **Drop the flag** — accurate, low cost.
- **Surface a structured cloning API** — requires lifting the SDK's `voice` type
  beyond `string`. Larger change; affects every provider with the same feature.

### 3. `dialogueCapabilities.maxVoices: 4` has no documented source

`dialogueCapabilities("s2-pro")` returns `{ minVoices: 1, maxVoices: 4 }`.
Fish's docs describe multi-speaker via `<|speaker:i|>` tags but don't publish an
explicit upper bound. The 4 may be a reasonable defensive cap, but it isn't pinned
to a Fish-documented limit. Either:

- Add a code comment citing where the 4 came from (changelog, support reply,
  experiment), or
- Verify with Fish and adjust.

### 4. Audio-tag stripping is bracket-only (pre-existing)

`stripAudioTags` strips `[…]`. This is fine for S2-Pro (the model has the
`audio-tags` feature so stripping is skipped). It would be a latent bug if S1 is
added with `audio-tags` listed — for unsupported-model fallbacks the stripper
wouldn't catch S1's `(paren)` emotion markers, and they'd leak to providers that
don't understand them. Mitigation: either gate the audio-tags flag on bracket-style
support, or extend `stripAudioTags` to accept a tag style.

## Things that look like gaps but aren't

- **No `streaming: true` body flag in `stream()`.** Fish's HTTP `/v1/tts` returns
  chunked transfer-encoded binary by default; true low-latency streaming with
  text-input streaming requires the separate WebSocket endpoint (`/v1/tts/live`).
  Current `stream()` is correct for decode-as-it-arrives.
- **JSON instead of msgpack.** Fish accepts both; JSON is correct. Pure perf
  optimization, not a correctness gap.
- **`prosody.speed` not used for the SDK's top-level `speed` option.** The SDK
  always routes `speed` through its time-stretch plugin (`isSpeedActive` in
  `src/apply-speed.ts`). That's an SDK-wide architectural choice, not a Fish-specific
  miss.
- **`pcm` output → `mediaType: audio/wav`.** Intentional. The SDK asks Fish for
  wav and converts down to PCM via mediabunny, matching the documented pattern
  in `AGENTS.md` ("providers must produce wav/pcm for any format the user requests
  that isn't natively available").

## Sources

- [Fish Audio — Text to Speech reference](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech)
- [`fishaudio/fish-audio-python` — TTSRequest / ReferenceAudio / Prosody schemas](https://deepwiki.com/fishaudio/fish-audio-python/3-api-reference)
- [Fish Audio S2-Pro emotion tags (HackerNoon)](https://hackernoon.com/fish-audios-s2-pro-brings-emotion-tags-to-text-to-speech)
- [How to Use Fish Audio S2 API — Apidog](https://apidog.com/blog/how-to-use-fish-audio-s2-api/)
- [WebSocket TTS streaming endpoint](https://docs.fish.audio/api-reference/endpoint/websocket/tts-live)
