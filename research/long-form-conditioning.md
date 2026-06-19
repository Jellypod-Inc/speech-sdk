# Long-form TTS conditioning across all providers — investigation

Status: research + recommendations. No code changed yet. Author: SDK audit.
Research date: 2026-06-19. Every external API claim is cited to the provider's
own docs; anything that could not be confirmed against a first-party page is
marked **UNVERIFIED**. These APIs change fast — re-confirm before implementing.

---

## TL;DR

- The SDK integrates **16 TTS backends + the Speechbase gateway** — not the four
  in the original brief. Full list derived from `src/providers/`: OpenAI,
  ElevenLabs, Deepgram (Aura), Google (Gemini TTS), Cartesia, Fish Audio,
  FAL (f5-tts/kokoro/orpheus), Gradium, Hume, Inworld, MiniMax, Mistral
  (Voxtral), Murf, Resemble, Smallest AI, xAI (Grok).
- **Core defect (confirmed in code): nothing is carried across chunk or turn
  boundaries today.** Both long-form paths fire *independent, parallel* requests
  and concatenate the audio. There is no `previous_text`, no `context_id`, no
  request-ID chaining, no audio prefix, and no persistent streaming session
  anywhere in the SDK. Voice identity is held only by re-passing the same voice
  string per request.
- **Only three providers expose true cross-request prosodic conditioning** that
  the SDK could thread on its existing batch paths: **ElevenLabs** (request
  stitching — `previous_text`/`next_text` + `previous_request_ids`/
  `next_request_ids`), **Hume** (`context.generation_id`, one step back), and
  **Cartesia/Fish/Deepgram/Murf/MiniMax/Gradium/Smallest** via **WebSocket
  sessions** that the SDK does not implement.
- **The single best long-form move that needs no new protocol**: prefer a single
  request up to each model's real max input, and stop chunking models whose true
  window is far larger than what the SDK currently declares (notably **MiniMax:
  SDK says 3 000 chars, real cap is 10 000**).
- **Latent correctness bug**: Murf and Resemble (and Mistral) have hard per-
  request caps (~3 000 / 2 000 / "~300 words") but declare **no `maxInputChars`**
  in the SDK, so long inputs are sent in one request and the provider will reject
  them. They never reach the stitch path.

---

## Step 1 — What we support, and what we do across boundaries today

### 1a. Provider/model inventory (derived from `src/providers/*/index.ts`)

| Provider (`id`) | Factory | Models we expose (exact ids) | SDK `maxInputChars` | `stream` | `generateDialogue` |
|---|---|---|---|---|---|
| openai | `createOpenAI` | `gpt-4o-mini-tts`, `tts-1`, `tts-1-hd` | 4096 | yes | no |
| elevenlabs | `createElevenLabs` | `eleven_v3`, `eleven_multilingual_v2`, `eleven_flash_v2_5`, `eleven_flash_v2` | 5000 / 10000 / 40000 / 30000 | yes | yes (v3) |
| deepgram | `createDeepgram` | `aura-2` | 2000 | yes | no |
| google | `createGoogle` | `gemini-3.1-flash-tts-preview`, `gemini-2.5-flash-preview-tts`, `gemini-2.5-pro-preview-tts` | — | yes | yes |
| cartesia | `createCartesia` | `sonic-3.5`, `sonic-3`, `sonic-2` | — | yes | no |
| fish-audio | `createFishAudio` | `s2-pro` | — | yes | yes |
| fal-ai | `createFal` | `f5-tts`, `kokoro`, `orpheus-tts` | 5000 (f5 only) | **no** | no |
| gradium | `createGradium` | `default` | 20000 (**unverified**) | yes | no |
| hume | `createHume` | `octave-2`, `octave-1` | 5000 | yes | yes |
| inworld | `createInworld` | `inworld-tts-2`, `inworld-tts-1.5-max`, `inworld-tts-1.5-mini` | 2000 | yes | no |
| minimax | `createMiniMax` | `speech-2.8-hd`, `speech-2.8-turbo` | 3000 (**real cap 10000**) | **no** | no |
| mistral | `createMistral` | `voxtral-mini-tts-2603` | — (**~300 words**) | yes | no |
| murf | `createMurf` | `GEN2`, `FALCON` (= Falcon 2) | — (**real cap 3000**) | yes | no |
| resemble | `createResemble` | `default` (= Chatterbox / `tts-v4`) | — (**real cap 2000/3000**) | yes | no |
| smallest-ai | `createSmallestAI` | `lightning_v3.1`, `lightning_v3.1_pro` | — | **no** | no |
| xai | `createXai` | `grok-tts` | 15000 | yes | no |
| gateway | `createSpeechGateway` | namespaced ids, e.g. `openai/tts-1` | server-owned | yes | yes (upstream) |

STT note: `openai` also ships an STT path (whisper) used as the default
timestamp fallback; `deepgram` here is TTS-only (Aura). Neither is relevant to
long-form TTS conditioning beyond timestamp derivation.

### 1b. How long text is sent today

**Single-speaker long-form — `generateChunkedSpeech` (`src/generate-speech.ts:353`).**
1. `splitTextByMaxChars` (`src/text-chunker.ts:55`) splits at the best available
   boundary (paragraph > line > sentence > whitespace, penalty-ranked) so chunks
   land near `maxInputChars`. Boundary selection itself is good.
2. Chunks are generated with **`mapWithConcurrency`** — i.e. **in parallel**,
   default 6 at a time (`GenerateSpeechOptions.maxConcurrency`).
3. Each chunk is an **independent `provider.generate()` call**; the only thing
   shared is the voice string and `providerOptions`.
4. Results are decoded to PCM16 and concatenated at **`gapMs: 0`** via
   `concatPcmToWav`. No crossfade, no level match, no conditioning.

**Multi-speaker — `runStitch` (`src/conversation/stitch.ts:74`).**
- Per-turn independent `generateSpeech()` calls, also `mapWithConcurrency`
  (parallel), concatenated with a configurable `gapMs` (default 300) and RMS
  level-normalized across turns. Again, no cross-turn conditioning.
- A **native** single-call dialogue path exists for providers that implement
  `generateDialogue` (ElevenLabs `eleven_v3`, Google Gemini, Fish `s2-pro`,
  Hume Octave) — chosen in `chooseConversationPath` (`src/conversation/dispatch.ts:27`).
  That single call *does* give cross-speaker coherence, but any per-turn
  `providerOptions` force a fallback to the independent-request stitch path
  (`dispatch.ts:64`).

**Streaming — `streamSpeech` (`src/stream-speech.ts`)** and every provider
`stream()`: a single HTTP/SSE/NDJSON request per call. **There is no persistent
WebSocket/session abstraction in the SDK at all**, so none of the providers'
WS-continuation conditioning is reachable.

### 1c. What is carried across boundaries today

**Nothing.** Confirmed by reading the code and grepping every provider for
`context_id`, `previous_text`, `previous_request`, `continue`, `seed`,
`session`, `ws://`/`wss://`, `prefix`, `continuation`: no hits that thread state
across requests. `providerOptions` pass through untransformed, so a caller *could*
hand-feed a `context_id` to a single request, but the SDK never carries it from
one chunk to the next, and the chunk loop is parallel (no ordering to condition
on). **Each chunk/turn resets prosody, intonation, and energy** — the seam
artifacts described in the brief are expected at every `gapMs:0` join.

### 1d. The gateway invariant constrains every fix

Per `CLAUDE.md`, on the gateway path the SDK is a thin REST transport and must be
byte-equivalent to `curl` against `api.speechbase.ai`. So any conditioning we add
must be (a) implemented client-side for direct-factory providers, **and** (b)
expressible on the gateway wire so the *server* can do the same threading. New
conditioning cannot be a client-only behavior on the gateway path.

---

## Step 2 + Step 4.1 — The conditioning matrix

Rubric surfaces: **1** cross-chunk text context · **2** prior-output reference
(IDs) · **3** audio-prefix/continuation · **4** persistent streaming session ·
**5** whole-document single-pass (max input) · **6** voice-identity lock · **7**
multi-speaker/dialogue · **8** live-audio (S2S).

Legend: ✅ supported · ⚠️ partial / caveated · ❌ not supported · ❓ UNVERIFIED.
"On the SDK path?" = reachable through `@speech-sdk/core` as written today.

| Provider · model(s) | 1 ctx-text | 2 prior-id | 3 audio-prefix | 4 WS session | 5 max single-pass | 6 voice lock | 7 dialogue | 8 S2S | Long-form | Real-time |
|---|---|---|---|---|---|---|---|---|---|---|
| **ElevenLabs** `multilingual_v2`,`flash_v2_5`,`flash_v2` | ✅ `previous_text`/`next_text` | ✅ `previous_request_ids`/`next_request_ids` (≤3, ≤2h) | ❌ | ✅ `/stream-input`, `/multi-stream-input` (`context_id`) | 10k / 40k / 30k chars | ✅ voice_id, clone, `seed` | ❌ (use v3) | ✅ `/v1/speech-to-speech` (`*_sts_v2`) | **Strong** (stitching + big window) | ✅ Flash ~75ms, WS |
| **ElevenLabs** `eleven_v3` | ❌ (stitching disabled on v3) | ❌ (disabled on v3) | ❌ | ❌ (no WS for v3; Alpha) | **5 000 chars** (help-center also says 3 000 — ❓ reconcile) | ✅ voice_id, clone, `seed` | ✅ `/v1/text-to-dialogue` (≤2 000 chars total, ≤10 voices) | n/a | ⚠️ big-window only | ❌ "not for real-time" |
| **OpenAI** `gpt-4o-mini-tts`,`tts-1`,`tts-1-hd` | ❌ | ❌ | ❌ | ❌ (Realtime is separate) | 4 096 chars (gpt-4o-mini-tts also 2 000 tokens; ❓ first-party) | ⚠️ preset voices; **no seed/clone**; `instructions` steering (mini-tts) | ❌ | ✅ Realtime API (`gpt-realtime`, WS/WebRTC) — separate | **Weak** (chunk-only, no conditioning) | ⚠️ output stream only; S2S via Realtime |
| **Cartesia** `sonic-3.5`,`sonic-3` | ❌ | ⚠️ `context_id` (live only; ctx expires 1s after last audio) | ❌ | ✅ WS continuations: `context_id`+`continue`, `flush`/`flush_id`, `max_buffer_delay_ms` [0–5000, def 3000] | ❓ no documented cap | ✅ `voice.id`, clone; **no seed** | ❌ | ⚠️ Voice Changer (batch S2S) | **Strong via WS** | ✅ ~90ms TTFB |
| **Cartesia** `sonic-2` | ❌ | ❓ (not in current model enums) | ❌ | ❓ (absent from WS enum) | ❓ | ✅ voice.id | ❌ | ⚠️ batch | ⚠️ legacy track | ✅ |
| **Fish Audio** `s2-pro` | ❌ | ✅ `condition_on_previous_chunks` (within a request/session) | ❌ | ✅ WS `tts-live` (one coherent generation) | ❓ no documented cap (chunk_length 300) | ✅ `reference_id`/`references` clone; **no seed** | ✅ `<\|speaker:N\|>` + `reference_id[]` | ❌ | **Strong** (native chunk carry-over) | ✅ WS |
| **Google Gemini TTS** `gemini-3.1/2.5-*-tts` | ❌ | ❌ | ❌ | ❌ (single-request stream only) | **~32k tokens** context | ⚠️ 30 preset voices; **no clone/seed** | ✅ `multi_speaker_voice_config` (**max 2 speakers**) + in-text style/tags | ❌ in TTS (Live API only) | **Strong** (huge single pass) | ✅ stream (3.1) |
| **Google Live API** (separate) | n/a | n/a | ✅ live audio in | ✅ stateful WS session | streaming | speechConfig | turn-based | ✅ native-audio S2S | n/a | ✅ |
| **Hume Octave** `octave-2`,`octave-1` | ⚠️ context utterances | ✅ `context.generation_id` (**one step back**; can't cross versions) | ❌ (ref by id, not audio) | ⚠️ continuation on stream JSON (id-based, not live session) | **5 000 chars/utterance** | ✅ voice id/name, clone (15s) | ✅ `utterances[]` multi-voice | ❌ | **Strong** (best id-chaining fit) | ✅ output stream |
| **Inworld** `inworld-tts-2`,`1.5-max`,`1.5-mini` | ❌ (REST) | ❌ (REST) | ❌ (REST) | ✅ but only via **separate Realtime WS** (not SDK's `:stream`) | **2 000 chars** | ✅ `voiceId`, clone `/voices:clone` (5–15s); **no seed** | ❓ Realtime concept; no per-speaker REST field | ✅ TTS-2 hears exchange — Realtime API only | ⚠️ chunk-only on REST | ✅ REST stream; live via Realtime |
| **MiniMax** `speech-2.8-hd`,`speech-2.8-turbo` | ❌ | ❌ | ⚠️ clone prompt only | ⚠️ WS `t2a_v2` (chunks, no documented carry-over) | **10 000 chars** (SDK caps at 3 000!) | ✅ `voice_id`, `timbre_weights` (mix ≤4); **no seed** | ❌ | ❌ | **Strong** (big window + stable voice) | ✅ WS / low-latency host |
| **Mistral Voxtral** `voxtral-mini-tts-2603` | ❌ | ❌ | ❌ (`ref_audio` = clone prompt) | ❌ (one-shot SSE) | ❓ "~300 words" guidance | ✅ `voice_id`/`ref_audio`; **no seed** | ❌ | ❌ | **Weak** (chunk-only) | ✅ SSE ~0.8s TTFB |
| **Murf** `GEN2`,`FALCON`(Falcon 2) | ❌ | ❌ (`context_id` = turn tag, not acoustic) | ❌ | ⚠️ WS sets `voice_config`; no cross-turn acoustic state | **3 000 chars** | ✅ `voiceId`, style/rate/pitch; **no seed**; clone = enterprise | ❌ (Studio only) | ⚠️ Voice Changer (batch, ≤3min) | **Weak** (chunk-only) | ✅ Falcon 2 ~55ms |
| **Resemble** `default` (Chatterbox `tts-v4`) | ❌ | ❌ (`request_id` = correlation) | ❌ | ⚠️ WS stream; no cross-msg state | **2 000** (sync/HTTP) / **3 000** (WS) chars | ✅ `voice_uuid`, clone; request `seed` ❓ (response only) | ❌ | ⚠️ `<resemble:convert>` (batch, URL) | **Weak** (small cap, chunk-only) | ✅ Turbo ~75ms |
| **Smallest AI** `lightning_v3.1`,`_pro` | ❌ | ❌ (`session_id`/`request_id` = correlation) | ❌ | ⚠️ WS `/tts/live` (buffer; carry-over ❓) | ❓ no documented cap (~250 is outdated) | ✅ clone (5–15s); **no seed** | ❌ | ❌ | ⚠️ chunk-only | ✅ SSE/WS (SSE deprecating 2026-07-14) |
| **xAI Grok** `grok-tts` | ❌ | ❌ | ❌ | ⚠️ WS stream (one synthesis) | **15 000 chars** | ⚠️ 5 preset voices; **no seed/clone** | ❌ | ✅ separate `grok-voice-latest` realtime agent | **Good** (big window) | ✅ WS; separate S2S |
| **Gradium** `default` | ❌ | ❌ (`client_req_id` = multiplexing) | ❌ | ⚠️ WS `tts_realtime`; carry-over ❓ | ❓ (SDK's 20 000 unconfirmed) | ⚠️ `voice_id`, clone marketed; **no seed** | ❌ | ❌ | ⚠️ chunk-only | ✅ WS realtime |
| **FAL** `f5-tts` | ❌ | ❌ | ⚠️ `ref_audio_url` = **clone, not continuation** | ❌ (async job, no stream) | **5 000 chars** | ✅ zero-shot clone via reference; no seed | ❌ | ❌ | **Very weak** (independent jobs) | ❌ |
| **FAL** `kokoro`,`orpheus-tts` | ❌ | ❌ | ❌ | ❌ | ❓ | ⚠️ preset voice enum only | ❌ | ❌ | **Very weak** | ❌ |

Per-surface exact parameters and the doc URLs behind every cell are in
[Appendix A](#appendix-a--per-provider-detail-with-citations).

---

## Step 3 — The gap, mapped to mechanisms

We need three distinct capabilities. They use different mechanisms and the SDK
falls short on all three in different ways.

### (a) Cross-chunk prosodic continuity for one speaker (long narration)

This is the primary brief. Best mechanism per provider:

| Provider | Best mechanism for (a) | Reachable on SDK path? | SDK shortfall |
|---|---|---|---|
| ElevenLabs (non-v3) | Request stitching: `previous_text`/`next_text` + `previous_request_ids`/`next_request_ids` | Batch-compatible, **but** needs serial chunks + capture of the response `request-id` header | Chunks run in parallel; request-id is never captured or threaded |
| Hume Octave | `context.generation_id` (chain each chunk to the previous generation) | Batch-compatible; needs serial chunks + capture of `generation_id` | Not threaded; `context` not surfaced (only via raw `providerOptions`) |
| Cartesia | WS continuations (`context_id`+`continue`, `flush`, `max_buffer_delay_ms`) | **No** — needs a streaming-session abstraction | SDK has no persistent WS session |
| Fish Audio | `condition_on_previous_chunks` (single request) or WS `tts-live` | Partly — works only within one request, which the SDK splits apart | SDK splits into independent requests, defeating it |
| MiniMax / xAI / Gemini / flash_v2_5 | **Avoid chunking** — single request up to the real (large) cap | Yes, trivially | SDK under-declares MiniMax cap (3 000 vs 10 000), so it chunks unnecessarily |
| OpenAI / Mistral / Murf / Resemble / Smallest / Gradium / FAL | None — no cross-request conditioning exists | n/a | Stuck with independent-chunk concat; document as best-effort |

### (b) Multi-speaker scripted dialogue continuity

Best mechanism is a **single native dialogue call** so the model conditions all
speakers together:

- ElevenLabs `eleven_v3` Text-to-Dialogue (≤2 000 chars total, ≤10 voices).
- Google Gemini multi-speaker `speech_config` (max 2 speakers, ~32k-token window).
- Fish `s2-pro` speaker tags `<|speaker:N|>` + `reference_id[]` (SDK caps 4).
- Hume `utterances[]` with per-utterance voice (SDK caps 4).

The SDK already routes to these via `generateDialogue`/`chooseConversationPath`.
**Shortfall:** any per-turn `providerOptions` force the fallback to the
independent-request `runStitch` path (`dispatch.ts:64`), which throws away
cross-speaker conditioning. Everything else (Cartesia, OpenAI, MiniMax, etc.)
has *no* dialogue primitive and can only be stitched — seams expected.

### (c) Conditioning on a live user's incoming audio (S2S)

No provider offers this on the plain TTS endpoints the SDK calls. It lives in
*separate* products: **Gemini Live API**, **OpenAI Realtime**, **Inworld
Realtime**, **xAI Voice agent**, **ElevenLabs Speech-to-Speech**, and batch
voice-changers (**Cartesia**, **Murf**, **Resemble**). **The SDK has no S2S/live
surface at all.** This is a green-field module, not a tweak to `generateSpeech`.

---

## Step 4.2 — Specific SDK code changes

All changes must honor the gateway invariant: implement client-side for direct
factories, and add the same fields to the gateway wire so the server can mirror
them.

### Change 1 — Add a conditioning capability descriptor to `SpeechProvider`

In `src/speech-provider.ts`, add an optional descriptor so the core can decide,
per model, *how* to do long-form:

```ts
type LongFormStrategy =
  | { mode: "single-pass" }                 // just send one request up to maxInputChars
  | { mode: "request-stitch" }              // previous_text/next_text + previous_request_ids
  | { mode: "context-id" }                  // chain on a returned generation/context id
  | { mode: "ws-continuation" }             // persistent WS session (future)
  | { mode: "independent" };                // current behavior; seams expected

interface SpeechProvider {
  // ...existing...
  longFormStrategy?(modelId: string): LongFormStrategy;
}
```

### Change 2 — Thread conditioning through `generate()` and capture prior-output ids

Extend the `generate()` options and result so the chunk loop can pass state
forward and read ids back (additive, all optional):

```ts
generate(options: {
  // ...existing...
  conditioning?: {
    previousText?: string;
    nextText?: string;
    previousRequestIds?: string[];   // ElevenLabs
    contextGenerationId?: string;    // Hume context.generation_id
  };
}): Promise<{
  // ...existing...
  requestId?: string;          // ElevenLabs response `request-id` header
  generationId?: string;       // Hume / providers that return one
}>;
```

- **ElevenLabs** (`src/providers/elevenlabs/index.ts`): map `conditioning` to
  `previous_text`/`next_text`/`previous_request_ids`/`next_request_ids`; read the
  `request-id` response header into `requestId`. Gate to non-`eleven_v3` models
  via `longFormStrategy` (return `single-pass` for `eleven_v3`).
- **Hume** (`src/providers/hume/index.ts`): map `conditioning.contextGenerationId`
  to `{ context: { generation_id } }`; return the new `generation_id`. Same-version
  only (octave-1 ↔ octave-2 can't chain).

### Change 3 — Make `generateChunkedSpeech` strategy-aware (the central fix)

`src/generate-speech.ts:353` currently always runs `mapWithConcurrency`. Branch
on `longFormStrategy(modelId)`:

- `request-stitch` / `context-id`: run chunks **serially** (concurrency 1) and
  thread state forward — each chunk gets `previousText = prevChunkText` (and, once
  available, `previousRequestIds = [prevRequestId]` / `contextGenerationId =
  prevGenerationId`). This is the behavior change that fixes seams for ElevenLabs
  and Hume. Keep boundary selection as-is (sentence/paragraph aware).
- `single-pass`: don't chunk if the text fits the (corrected) `maxInputChars`.
- `ws-continuation`: out of scope for the batch path — see Change 5.
- `independent` / unset: current parallel concat (preserve as the fallback).

Also add a small **equal-power crossfade** (a few ms) in `concatPcmToWav`
(`src/conversation/pcm-concat.ts`) for the `independent` path to soften energy
jumps where no real conditioning exists. (Empirical — see open questions.)

### Change 4 — Correct `maxInputChars` and add missing caps

Pure metadata fixes in the provider `models[]`:

- **MiniMax**: `3000 → 10000` (real documented cap) so coherent text up to 10k
  goes in one request instead of being chunked.
- **Murf**: add `maxInputChars: 3000`. **Resemble**: add `2000` (sync/HTTP) — so
  oversized inputs actually chunk instead of erroring at the provider.
- **Mistral**: add a conservative cap (e.g. ~2 000 chars / "~300 words") and flag
  as unverified.
- **Gradium**: the declared `20000` is **unverified** — lower to a confirmed value
  or mark provisional.
- Leave Cartesia/Fish/Gemini uncapped (no documented per-request cap / huge
  windows), but consider a sane chunk size for Cartesia until WS lands.

### Change 5 — (Larger) Persistent streaming-session abstraction

To unlock Cartesia continuations, Fish `tts-live`, Deepgram/Murf/MiniMax/Gradium/
Smallest WS, add a new `openSession()`-style API distinct from one-shot
`stream()` — a session that holds a connection, a `context_id`, and `push()`/
`flush()`/`finish()` semantics, surfacing `max_buffer_delay_ms`. This is the only
way to get true streaming conditioning and is the right home for capability (c)
later. Scope it as its own milestone; Changes 1–4 deliver most of the long-form
win without it.

### Change 6 — Preserve native dialogue conditioning under per-turn options

In `src/conversation/dispatch.ts:64`, per-turn `providerOptions` currently force
the lossy stitch fallback. Where a provider can express per-utterance options
inside its native dialogue call (Hume `utterances[]`, Fish per-speaker), pass them
through natively instead of falling back, so multi-speaker conditioning (b) is
kept.

---

## Step 4.3 — Recommended default long-form approach + per-provider fallback

**Default policy (single speaker):**
1. If the (corrected) text fits the model's real `maxInputChars`, **send one
   request** — best coherence, lowest complexity. Big-window models (Gemini ~32k
   tok, ElevenLabs flash_v2_5 40k, xAI 15k, MiniMax 10k, multilingual_v2 10k)
   cover most "long agent turn" cases this way.
2. Else, chunk and apply the best available conditioning:
   - **ElevenLabs (non-v3)** → request stitching (serial, threaded).
   - **Hume** → `context.generation_id` chaining (serial).
   - **Cartesia / Fish** → WS continuation session once Change 5 lands; until then,
     prefer larger single requests.
3. Else (no conditioning primitive) → current independent-chunk concat **+
   crossfade**, with the same voice id held constant. Document seams as expected.

**Per-provider fallback / routing guidance:**

| Tier | Providers | Long-form route |
|---|---|---|
| **Best for long narration** | ElevenLabs (flash_v2_5 / multilingual_v2), Hume Octave, Gemini TTS, MiniMax | big single pass and/or native conditioning |
| **Good via WS (after Change 5)** | Cartesia, Fish Audio | continuation sessions |
| **Usable, no conditioning** | xAI (15k window), Gradium, Smallest, Mistral, Murf | single pass where it fits; else best-effort concat |
| **Route long-form AWAY from** | **OpenAI** (4 096 cap, no conditioning), **Resemble** (2–3k cap, no conditioning), **FAL** (independent async jobs, no stream, no conditioning) | use only for short turns; do not target for audiobook/podcast |

**Providers that cannot do long-form conditioning at all** (independent requests
only, no continuity primitive): OpenAI, FAL (all three), Resemble, Mistral, Murf,
Smallest, Gradium, MiniMax (beyond its 10k single pass), Deepgram, Inworld
(on the REST path the SDK uses). For these, long-form coherence == "hold the
voice id constant and accept seam artifacts."

**Multi-speaker default:** prefer the native dialogue call (ElevenLabs v3, Gemini,
Fish, Hume); everything else → stitch with `gapMs`, accepting per-turn resets.

**Live audio (c):** out of scope for `generateSpeech`. If needed, build a separate
realtime module targeting Gemini Live / OpenAI Realtime / ElevenLabs S2S.

---

## Step 4.4 — Open questions needing empirical testing

1. **Boundary artifacts**: measure pitch drift / energy jump at `gapMs:0` joins
   per provider, with and without the proposed crossfade; quantify how much
   ElevenLabs stitching and Hume `generation_id` chaining actually remove.
2. **ElevenLabs `eleven_v3` char cap**: official Models page says **5 000**, the
   help center says **3 000**. Confirm against a live 422 before trusting either.
3. **Request-id availability**: verify the `request-id` header is present and that
   stitching works on our account tier; confirm zero-retention disables it.
4. **Cartesia context expiry (1 s)**: measure the real latency cost of buffering
   and tune `max_buffer_delay_ms` (0–5000, default 3000) for narration vs latency.
5. **Fish `condition_on_previous_chunks`**: does it meaningfully reduce seams
   across separate WS messages, or only within a single generation?
6. **Serial vs parallel cost**: serial chunking (needed for stitching) raises
   wall-clock latency — quantify the trade vs the coherence gain.
7. **Unverified single-pass caps**: empirically find the true max for Gradium,
   Smallest, MiniMax (confirm 10k), kokoro, orpheus, Mistral.
8. **WS cross-message state** (Deepgram, Murf, MiniMax, Gradium, Smallest): docs
   are silent on whether prosody carries across `Flush`/`task_continue` segments —
   test before claiming continuity.
9. **Gateway parity**: every conditioning field added client-side must be mirrored
   by the Speechbase server to keep the SDK↔curl byte-equivalence invariant.

---

## Appendix A — Per-provider detail with citations

> Each entry: existence check, the exact params behind the matrix row, and the
> doc URLs. **UNVERIFIED** = not confirmable from a first-party page.

### ElevenLabs (`api.elevenlabs.io`)
- Models all Active: `eleven_v3` (5 000 chars per Models doc; help-center says
  3 000 — reconcile), `eleven_multilingual_v2` (10 000), `eleven_flash_v2_5`
  (40 000), `eleven_flash_v2` (30 000).
- **Request stitching**: `previous_text`/`next_text` AND `previous_request_ids`/
  `next_request_ids` (max 3 each, ids ≤2 h old, referenced request must be fully
  processed). If both text+ids given, text is ignored. **Not on `eleven_v3`.**
  Disabled under zero-retention (`enable_logging=false`, enterprise).
- **WebSocket**: `/v1/text-to-speech/{voice_id}/stream-input` and
  `/multi-stream-input` (per-`context_id` state). Not for v3.
- **Voice lock**: `voice_id` + clone (IVC/PVC) + `seed` (0–4294967295, best-effort).
- **Dialogue**: `POST /v1/text-to-dialogue`, `inputs[]` of `{text, voice_id}`,
  ≤2 000 chars total, ≤10 voices, default model `eleven_v3`; batch (a streaming
  variant exists). Not real-time.
- **S2S**: `POST /v1/speech-to-speech/{voice_id}` (+`/stream`), `eleven_english_sts_v2`.
- Docs: convert https://elevenlabs.io/docs/api-reference/text-to-speech/convert ·
  stitching https://elevenlabs.io/docs/eleven-api/guides/how-to/text-to-speech/request-stitching ·
  models https://elevenlabs.io/docs/overview/models ·
  dialogue https://elevenlabs.io/docs/api-reference/text-to-dialogue/convert ·
  multi-context WS https://elevenlabs.io/docs/api-reference/multi-context-text-to-speech/v-1-text-to-speech-voice-id-multi-stream-input ·
  S2S https://elevenlabs.io/docs/api-reference/speech-to-speech/convert ·
  zero-retention https://elevenlabs.io/docs/eleven-api/resources/zero-retention-mode

### OpenAI (`api.openai.com`)
- `POST /v1/audio/speech`. No cross-request conditioning, no seed, no clone.
  `instructions` steering documented for `gpt-4o-mini-tts` only. Max 4 096 chars
  (community-reported; **UNVERIFIED first-party**); gpt-4o-mini-tts model page
  lists a 2 000-token cap. Realtime API (`gpt-realtime`, WS/WebRTC at `/v1/realtime`)
  is the separate S2S product.
- Docs: TTS https://developers.openai.com/api/docs/guides/text-to-speech ·
  gpt-4o-mini-tts https://developers.openai.com/api/docs/models/gpt-4o-mini-tts ·
  Realtime https://developers.openai.com/api/docs/guides/realtime-websocket

### Cartesia (`api.cartesia.ai`)
- `sonic-3.5`, `sonic-3` confirmed; `sonic-2` is legacy and absent from current
  WS/bytes model enums (**UNVERIFIED** there). No `previous_text`/`next_text`, no
  audio prefix, no `seed`, no dialogue.
- **WS continuations**: `context_id`, `continue` (bool), `flush`+`flush_id`,
  `max_buffer_delay_ms` (0–5000, default 3000). Contexts **expire 1 s** after last
  audio output. Voice lock via `voice.mode="id"`/`voice.id` + clone.
- **S2S**: `POST /voice-changer/bytes` (batch, file in). No per-request char cap
  documented (**UNVERIFIED**).
- Docs: continuations https://docs.cartesia.ai/build-with-cartesia/capability-guides/stream-inputs-using-continuations ·
  bytes https://docs.cartesia.ai/api-reference/tts/bytes ·
  contexts https://docs.cartesia.ai/api-reference/tts/working-with-web-sockets/contexts ·
  voice changer https://docs.cartesia.ai/api-reference/voice-changer/bytes

### Fish Audio (`api.fish.audio`)
- `s2-pro`. **`condition_on_previous_chunks`** (bool, default true) carries audio
  context within a request/session. WS `tts-live` (`StartEvent`/`TextEvent`/
  `FlushEvent`/`StopEvent`) = one coherent generation. Dialogue via
  `<|speaker:N|>` tags + `reference_id[]`. Clone via `reference_id` or inline
  `references`. No seed. No per-request char cap documented (**UNVERIFIED**;
  internal `chunk_length` 300). SDK uses REST only — WS not implemented.
- Docs: TTS https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech ·
  WS https://docs.fish.audio/api-reference/endpoint/websocket/tts-live

### Google — Gemini TTS / Live / Cloud Chirp 3
- **Gemini TTS** (`gemini-3.1-flash-tts-preview`, `gemini-2.5-flash/pro-preview-tts`):
  text-in/audio-out only. ~32k-token context. Multi-speaker via
  `multi_speaker_voice_config.speaker_voice_configs` (**max 2 speakers**); style/
  scene/audio-tags conveyed in text. 30 preset voices, no clone/seed. Streaming
  (Interactions API) on 3.1 only. No cross-request conditioning, no S2S.
- **Gemini Live API** (separate): native-audio S2S, stateful WS session, live
  audio in — this is where surfaces 4 and 8 live for Google.
- **Cloud TTS Chirp 3 HD** (separate product): text-only, no multi-speaker/clone;
  max input **UNVERIFIED**.
- Docs: speech-gen https://ai.google.dev/gemini-api/docs/interactions/speech-generation ·
  generateContent https://ai.google.dev/gemini-api/docs/speech-generation ·
  Live https://ai.google.dev/gemini-api/docs/live-guide ·
  Chirp 3 https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd

### Hume Octave (`api.hume.ai`)
- `octave-2`, `octave-1`. **`context.generation_id`** continues prosody from the
  immediately preceding generation (**one step back**; octave-1↔2 can't chain).
  5 000 chars/utterance (description ≤1 000). Multi-voice `utterances[]`. Voice
  by id/name + clone (15 s). No S2S. SDK would pass `context` via `providerOptions`
  today (not first-class). Octave-2 selected via a `version` field (exact public
  field name **UNVERIFIED**).
- Docs: continuation https://dev.hume.ai/docs/text-to-speech-tts/continuation ·
  overview https://dev.hume.ai/docs/text-to-speech-tts/overview ·
  voice https://dev.hume.ai/docs/text-to-speech-tts/voice

### Inworld (`api.inworld.ai`)
- `inworld-tts-2`, `inworld-tts-1.5-max`, `inworld-tts-1.5-mini`. REST
  `/tts/v1/voice`(+`:stream`): 2 000 chars; no context/prior-id/audio field. Clone
  `/voices/v1/voices:clone` (5–15 s). NL direction via inline `[...]` tags. TTS-2's
  "hears the exchange" + live audio = **separate Realtime WS session**, not the
  REST path the SDK calls. No seed. Multi-speaker on REST **UNVERIFIED**.
- Docs: intro https://docs.inworld.ai/tts/tts · synthesize
  https://docs.inworld.ai/api-reference/ttsAPI/texttospeech/synthesize-speech ·
  realtime https://inworld.ai/blog/realtime-tts-2

### MiniMax (`api.minimax.io`)
- `speech-2.8-hd`, `speech-2.8-turbo` confirmed. `POST /v1/t2a_v2`. **10 000 char**
  max (SDK under-declares 3 000). No context/prior-id/cross-chunk fields. Voice
  lock via `voice_id` + `timbre_weights` (mix ≤4); clone `POST /v1/voice_clone`.
  **No speech seed** (seed is Music-only). WS `t2a_v2` streams chunks; cross-message
  carry-over **UNVERIFIED**. No dialogue, no S2S.
- Docs: HTTP https://platform.minimax.io/docs/api-reference/speech-t2a-http ·
  WS https://platform.minimax.io/docs/api-reference/speech-t2a-websocket ·
  clone https://platform.minimax.io/docs/guides/speech-voice-clone

### Mistral Voxtral (`api.mistral.ai`)
- `voxtral-mini-tts-2603`. `POST /v1/audio/speech`. Fields: `input`, `voice_id`,
  `ref_audio` (clone prompt, not continuation), `response_format`, `stream`. **No
  seed** (official schema). No context/prior-id/dialogue/S2S. No documented char
  cap — guidance "under 300 words" (**UNVERIFIED** numeric). SSE streaming.
- Docs: https://docs.mistral.ai/api/endpoint/audio/speech ·
  https://docs.mistral.ai/capabilities/audio/text_to_speech

### Murf (`api.murf.ai`)
- `gen2` (REST `/v1/speech/generate`), `falcon-2` (`/v1/speech/stream`, WS
  `wss://global.api.murf.ai/v1/speech/stream-input`). **3 000 chars**. `context_id`
  is a turn tag, **not** acoustic conditioning. WS sets `voice_config` once; no
  cross-turn acoustic state. No seed; clone = enterprise. No dialogue API. Voice
  Changer = batch S2S (≤3 min). Falcon 2 ~55 ms.
- Docs: generate https://murf.ai/api/docs/api-reference/text-to-speech/generate ·
  WS https://murf.ai/api/docs/text-to-speech/web-sockets ·
  context-id https://murf.ai/api/docs/text-to-speech/web-sockets/context-id ·
  voice changer https://murf.ai/api/docs/capabilities/voice-changer

### Resemble (`f.cluster.resemble.ai`)
- `default` → Chatterbox (`tts-v4`); Turbo = `tts-v4-turbo`. Sync `/synthesize`
  (2 000 chars), HTTP `/stream` (2 000), WS `wss://websocket.cluster.resemble.ai/stream`
  (3 000, excl. tags). No context/prior-id/continuation. `request_id` = correlation
  only. Voice lock via `voice_uuid` + clone; request-level `seed` **UNVERIFIED**
  (seed only in responses). S2S via `<resemble:convert src="WAV URL">` (batch).
- Docs: models https://docs.resemble.ai/getting-started/model-versions ·
  stream https://docs.resemble.ai/api-reference/text-to-speech/stream-synthesize ·
  WS https://docs.resemble.ai/voice-generation/text-to-speech/streaming-websocket ·
  S2S https://docs.resemble.ai/voice-generation/speech-to-speech

### Smallest AI (`api.smallest.ai/waves/v1`)
- `lightning_v3.1`, `lightning_v3.1_pro`. `POST /tts`; SSE + WS `/tts/live` (SSE
  deprecating 2026-07-14). No documented char cap (the "~250" is outdated;
  **UNVERIFIED**). `session_id`/`request_id` = correlation only. Clone (5–15 s),
  no seed. No dialogue/S2S. WS cross-message state **UNVERIFIED**.
- Docs: synthesize https://docs.smallest.ai/waves/api-reference/api-reference/text-to-speech/synthesize-lightning-v-31-speech ·
  SSE https://docs.smallest.ai/waves/api-reference/api-reference/text-to-speech/stream-lightning-v-31-speech

### xAI Grok (`api.x.ai/v1`)
- `grok-tts` confirmed public. `POST /tts`, **15 000 chars**. Audio tags (`[pause]`,
  `[laugh]`, `<whisper>…`). 5 preset voices (`eve` default), **no seed/clone**. WS
  streaming for one synthesis (message types **UNVERIFIED**). No cross-request
  conditioning, no dialogue. Live S2S = separate `grok-voice-latest` realtime agent
  (`wss://api.x.ai/v1/realtime`).
- Docs: TTS https://docs.x.ai/developers/model-capabilities/audio/text-to-speech ·
  voice https://docs.x.ai/developers/model-capabilities/audio/voice

### Gradium (`api.gradium.ai`)
- `default`. `/api/post/speech/tts`; WS `wss://api.gradium.ai/api/speech/tts`
  (`tts_realtime`/`tts_stream`/`tts`). `client_req_id`/`request_id` = multiplexing/
  correlation, not conditioning. `voice_id` + `json_config` (temperature, voice
  similarity); no seed. **No documented char cap** (SDK's 20 000 **UNVERIFIED**).
  No dialogue/S2S. WS cross-message state **UNVERIFIED**.
- Docs: https://docs.gradium.ai/guides/text-to-speech

### FAL (`fal.run`)
- `f5-tts`: `gen_text` (**5 000 chars**), `ref_audio_url`+`ref_text` = **zero-shot
  cloning, not continuation**. `kokoro`/`orpheus-tts`: preset voice enums; orpheus
  has emotive tags (`<laugh>`, `<sigh>`, …). All three are **stateless async jobs**
  — no streaming, no session, no cross-request conditioning, no S2S. kokoro/orpheus
  max length **UNVERIFIED**.
- Docs: f5 https://fal.ai/models/fal-ai/f5-tts/api · kokoro
  https://fal.ai/models/fal-ai/kokoro/american-english/api · orpheus
  https://fal.ai/models/fal-ai/orpheus-tts/api

---

## Appendix B — SDK code references (seams to change)

- `src/generate-speech.ts:353` — `generateChunkedSpeech` (parallel, `gapMs:0`
  concat). **Primary change site** (Change 3).
- `src/text-chunker.ts:55` — `splitTextByMaxChars` boundary logic (keep).
- `src/conversation/stitch.ts:74` — `runStitch` (parallel per-turn). Multi-speaker
  seam site.
- `src/conversation/dispatch.ts:64` — per-turn `providerOptions` force stitch
  fallback (Change 6).
- `src/conversation/pcm-concat.ts` — `concatPcmToWav` (add crossfade option).
- `src/speech-provider.ts` — `SpeechProvider.generate()` options/result, add
  `longFormStrategy` + `conditioning` (Changes 1–2).
- `src/stream-speech.ts` + provider `stream()` — single-shot today; home for the
  future `openSession()` WS abstraction (Change 5).
- `src/providers/gateway/index.ts` — any new conditioning field must be added to
  the gateway request body to preserve the byte-equivalence invariant.
