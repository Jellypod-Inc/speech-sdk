# Speech Gateway: Conversation Endpoint Spec

**Status**: Finalized wire contract (coordinated with server team). SDK implementation pending server PR merge.

This is the wire contract `api.speechgateway.com` implements to support `generateConversation()` fast-path. Today, conversation calls through the gateway fall back to the SDK's stitch path — N separate `/v1/audio/speech` calls plus client-side mediabunny concatenation. That defeats the gateway's purpose and pulls audio-mux code into every gateway user's bundle.

## What ships in Phase 1 vs. later

The wire contract below is the full shape. Actual server support ships incrementally:

| Feature | Phase 1 (day 1) | Later |
|---|---|---|
| Binary audio response (`Accept: audio/*`) | ✅ | |
| JSON envelope with base64 audio (`Accept: application/json`) | ✅ | |
| `warnings` + `providerMetadata.perTurn` in JSON response | ✅ | |
| Server-side stitch + normalize + gap | ✅ | |
| `timestamps: "on"` — per-word alignment with `turnIndex` | ❌ returns 501 `timestamps_unsupported` | ✅ eventually |
| Per-turn `model` overrides | ❌ single top-level model only | Future (SDK falls back to stitch) |
| Streaming response | ❌ | Future |

**SDK implication:** the static capability table ships with `timestamps: false` on every gateway model. A caller passing `timestamps: "on"` through gateway falls back to client-side STT (Whisper) via the existing `timestampProvider` plumbing — same behavior as direct providers without native alignment. When the server adds support, flip the flag; zero SDK change needed past that flip.

## Related: `/v1/audio/speech` JSON envelope

The existing `/v1/audio/speech` endpoint also supports JSON content negotiation via `Accept: application/json`. Its envelope shares the same outer keys:

```json
{
  "audio": "<base64>",
  "mediaType": "audio/mpeg",
  "warnings": [],
  "providerMetadata": { "provider": "openai", "model": "gpt-4o-mini-tts", "voice": "alloy" },
  "timestamps": []
}
```

`timestamps` is **always present** on this envelope — empty array `[]` today, populated in future when native-alignment providers (ElevenLabs, Inworld, Hume octave-2, Cartesia sonic-3, Resemble, Murf GEN2) are wired through. SDK keeps its JSON parsing code in place so it lights up automatically.

SDK defaults **binary** for `/v1/audio/speech` (streaming matters; warnings/metadata via headers is sufficient today) and **JSON** for `/v1/audio/conversation` (can't stream a mixed conversation; need `perTurn` + `warnings` from the body).

## Endpoint

```
POST /v1/audio/conversation
```

## Request

```http
POST /v1/audio/conversation
Authorization: Bearer <SPEECH_GATEWAY_API_KEY>
Accept: audio/mpeg              # binary path — mixed audio bytes
# OR
Accept: application/json        # JSON path — base64 audio + timestamps + warnings
Content-Type: application/json
```

```json
{
  "mode": "conversation",
  "model": "elevenlabs/eleven_v3",
  "turns": [
    { "voice": "rachel", "text": "Hi there." },
    { "voice": "adam",   "text": "Hello!" },
    { "voice": "sam",    "text": "Hey both, what's up?" }
  ],
  "gapMs": 300,
  "volumeDbfs": -20,
  "normalizeVolume": true,
  "timestamps": "off",
  "providerOptions": {}
}
```

`timestamps: "on"` returns 501 in Phase 1. Example uses `"off"` to reflect day-1 behavior; the field shape for the eventual `"on"` response is documented below as a forward reference.

### Field reference

| Field             | Type                                   | Required | Default | Notes |
|-------------------|----------------------------------------|----------|---------|-------|
| `mode`            | `"conversation"`                       | yes      |         | Distinguishes from `"inline"` (single utterance). |
| `model`           | `"<provider>/<model>"`                 | yes      |         | Same namespacing as `/v1/audio/speech`. |
| `turns`           | `Array<{voice, text}>`                 | yes      |         | N items, N speakers. Same voice may repeat across turns. |
| `turns[].voice`   | `string \| {url} \| {audio}`           | yes      |         | Provider voice id, voice clone URL, or inline audio bytes. |
| `turns[].text`    | `string`                               | yes      |         | Non-empty. |
| `gapMs`           | `number`                               | no       | `300`   | Silence between turns in ms. |
| `volumeDbfs`      | `number`                               | no       | `-20`   | RMS normalization target. Server-side. |
| `normalizeVolume` | `boolean`                              | no       | `true`  | When `false`, skip normalization. |
| `timestamps`      | `"on" \| "auto" \| "off"`              | no       | `"auto"`| See timestamps section. |
| `providerOptions` | `Record<string, unknown>`              | no       | `{}`    | Forwarded to upstream provider untransformed. |

## Server responsibilities

1. **Render every turn.** Strategy is opaque to the SDK — server may use:
   - Native multi-speaker endpoint (ElevenLabs text-to-dialogue, Google gemini-tts, etc.) when available.
   - Per-turn rendering + server-side stitching when the upstream provider has no multi-speaker mode.
   - Hybrid (group consecutive same-voice turns into one upstream call).

   The contract is "give me one mixed audio file."

2. **Stitch** with `gapMs` of silence between turns.

3. **Normalize** the mixed audio to `volumeDbfs` if `normalizeVolume !== false`.

4. **Validate** voice/turn constraints for models that have them. Return `400` with structured error if violated.

5. **Timestamps** — see below.

6. **Surface upstream warnings** in the JSON response (e.g., "couldn't normalize because mixed mp3" — match the warnings contract from `/v1/audio/speech`).

## Response — binary path (Accept: audio/*)

Mixed audio bytes. `Content-Type` matches the actual format (`audio/mpeg`, `audio/wav`, etc.) — set the response header accurately so the SDK doesn't have to sniff.

No JSON body. The SDK doesn't get timestamps or warnings on this path — that's the tradeoff for the slimmer payload.

## Response — JSON path (Accept: application/json)

```json
{
  "audio": "<base64-encoded mixed audio>",
  "mediaType": "audio/wav",
  "timestamps": [
    { "text": "Hi",     "start": 0.00, "end": 0.15, "turnIndex": 0 },
    { "text": "there.", "start": 0.16, "end": 0.42, "turnIndex": 0 },
    { "text": "Hello!", "start": 0.72, "end": 1.05, "turnIndex": 1 },
    { "text": "Hey",    "start": 1.35, "end": 1.50, "turnIndex": 2 }
  ],
  "warnings": [],
  "providerMetadata": {
    "perTurn": [
      { "provider": "elevenlabs", "model": "eleven_v3", "voice": "rachel", "requestId": "..." },
      { "provider": "elevenlabs", "model": "eleven_v3", "voice": "adam",   "requestId": "..." },
      { "provider": "elevenlabs", "model": "eleven_v3", "voice": "sam",    "requestId": "..." }
    ]
  }
}
```

### Field notes

- **`audioDurationMs` is intentionally omitted.** The SDK computes audio duration client-side via mediabunny so all paths (gateway + direct providers) behave identically. Don't add it.
- **`timestamps[].turnIndex` is REQUIRED on every word** when `timestamps` is `"on"` (or `"auto"` and the server is returning timestamps). It's the index into the request `turns` array. Why required (not optional):
  - Per-turn rendering trivially knows the source turn for every word.
  - Native multi-speaker endpoints typically return per-segment speaker info that maps cleanly back to turns.
  - When STT fallback is used on the mixed audio, the server still knows each turn's pre-mix duration and gap structure — it can attribute words by time-bucketing into the correct turn slot. If attribution drops below confidence threshold, return `500` rather than emit ambiguous data.
- **`providerMetadata.perTurn`** length always matches `turns.length`, even when the server batched multiple turns into one upstream call. Synthesize per-turn entries in that case.

## Timestamps semantics

The `timestamps` field is **always present** in the JSON response envelope — an empty array `[]` when no timestamps are computed, a populated array when they are. SDK callers never need to null-check; `for (const word of result.timestamps)` just works. Matches the existing `warnings: []` pattern.

**Phase 1 current behavior (what ships day 1):**

| Mode    | Behavior |
|---------|----------|
| `"off"` | Return `timestamps: []`. |
| `"auto"`| Return `timestamps: []` (no model produces gateway-attributable alignment yet). |
| `"on"`  | **Return `501 timestamps_unsupported`.** SDK gates this client-side via the capability table so it shouldn't hit the wire; if it does, non-retriable. |

**Future behavior (when native alignment + turn attribution are wired through):**

| Mode    | Behavior |
|---------|----------|
| `"off"` | Return `timestamps: []`. |
| `"on"`  | Return populated `timestamps` with `turnIndex` on every word. Prefer native-aligned data; fall back to STT on the mixed audio if necessary. If STT confidence is too low to attribute, return `500` (don't emit unattributed words). |
| `"auto"`| Return populated `timestamps` with `turnIndex` if free; `[]` otherwise. |

**Long-term direction:** server eventually produces timestamps unconditionally (STT fallback server-side when native alignment is unavailable). When that lands, `"on"` stops returning 501 and starts always-populating.

## Errors

All error responses use **RFC 7807 `application/problem+json`** (shared across all gateway endpoints):

```json
{
  "type": "about:blank",
  "title": "ServiceError",
  "status": 501,
  "detail": "Per-word timestamps with turnIndex are not yet supported on the gateway.",
  "code": "timestamps_unsupported"
}
```

- `code` is a problem+json extension (RFC 7807 explicitly allows extensions). It's optional but stable when set — SDK matches on it for user-friendly error handling.
- `Content-Type: application/problem+json` (not `application/json`). SDK error parsing must accept both.
- Older gateway endpoints may emit the base shape without `code`; `code` is added incrementally as endpoints are touched. The conversation 501 ships with `code: "timestamps_unsupported"` from day 1.

| Status | When | SDK behavior |
|--------|------|--------------|
| `400`  | Validation failure (voice count, char limit, unknown model, empty turn text). | SDK throws structured error. |
| `401`  | Missing/expired API key. | SDK rewrites to friendly sign-up message client-side. |
| `429`  | Rate limit. | SDK retries via `p-retry`. |
| `501`  | Feature not supported (today: `timestamps: "on"` on conversation). | **Non-retriable.** SDK gates client-side via static capability table so this should rarely hit the wire. |
| `5xx`  | Upstream/server failure. | SDK retries. |

## Capability discovery

The SDK needs to know, per model:

- Does this `provider/model` support the conversation endpoint?
- What are the constraints (max unique voices, max total chars, max turn count)?

Two options:

- **v1: Static SDK-side table.** SDK ships with a hardcoded list of models that support `/v1/audio/conversation` and their constraints. Drift risk if the server adds support without an SDK release.
- **v2: `GET /v1/models`.** Server returns canonical capabilities. SDK fetches once per process and caches. Recommended cleanup once the model list stabilizes.

Recommend shipping v1 first.

## Out of scope (future)

- **Streaming the conversation response** (chunked-encoded partial audio + interleaved `turnIndex` events). Useful for long conversations. Defer until single-shot is solid.
- **Per-turn `gapMs` overrides** (e.g., longer pause between certain speakers). Ship a single global `gapMs` first; revisit if customers ask.
- **Per-turn `model` overrides** through the gateway (mixing providers in one conversation request). Today the SDK supports this via the stitch path; the gateway endpoint requires a single model. Defer until clear demand.

## SDK changes (pending server PR merge)

Tracked but not implemented yet:

1. Add `generateConversation()` provider-level method to `SpeechGatewayProvider` (distinct from the public `generateConversation()` function — this is the orchestrator hook).
2. Wire `chooseConversationPath()` to pick the gateway native path for any gateway-routed model with conversation capability. Skip the stitch fallback so users never bundle `pcm-concat` / `audio-utils` / `mediabunny` WAV mux through this codepath.
3. Static capability table per the v1 plan above. Ships with `timestamps: false` on every model.
4. Extend `ApiError` to carry an optional `code?: string` field extracted from problem+json extensions. Makes `timestamps_unsupported` (and future codes) matchable by callers.
5. Make 501 non-retriable in `p-retry` config.
6. Map wire `providerMetadata.perTurn` → existing public `providerMetadata.turns` shape internally for backward compat.
7. E2E test: 3+ turn conversation through gateway returns one mixed file with `timestamps: "off"` (Phase 1). Add `timestamps: "on"` assertion once server flips the flag.
