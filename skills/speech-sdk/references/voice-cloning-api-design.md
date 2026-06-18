# Voice Cloning API — Design Proposal

Status: **proposal / not yet implemented.** Documents the design for a new
top-level `cloneVoice()` function that creates a **persisted** cloned voice on a
provider from one or more audio samples and returns a reusable voice ID.

Distinct from the existing **inline** cloning (`voice: { audio }` / `{ url }` on
`generateSpeech`, see `voice-cloning.md`), which mimics reference audio for a
single generation and saves nothing.

## Goal

```ts
import { cloneVoice, generateSpeech } from "@speech-sdk/core";
import { createElevenLabs } from "@speech-sdk/core/providers";

const elevenlabs = createElevenLabs();

const voice = await cloneVoice({
  model: elevenlabs("eleven_multilingual_v2"),
  files: [readFileSync("./sample.wav")],
  name: "Pierson",
});

await generateSpeech({
  model: elevenlabs("eleven_multilingual_v2"),
  voice: voice.voiceId,
  text: "Hello in my own voice!",
});
```

`{ model, files, name }` is all most callers touch. Everything a specific
provider additionally demands (a language code, a self-assigned ID, base64 vs
multipart transport, a locale enum) is absorbed by the per-provider adapter.

## Public surface

```ts
export type VoiceSample =
  | Uint8Array
  | { audio: string | Uint8Array; mediaType?: string; transcript?: string }
  | { url: string; transcript?: string };

export interface CloneVoiceOptions {
  model: ResolvedModel;                 // factory only in v1; a string throws
  files: VoiceSample | VoiceSample[];
  name: string;                         // required
  language?: string;                    // BCP-47; defaults to "en" (+warning) where required
  providerOptions?: Record<string, unknown>;
  apiKey?: string;
  abortSignal?: AbortSignal;
  headers?: Record<string, string>;
}

export interface ClonedVoice {
  voiceId: string;
  provider: string;
  warnings?: string[];
  providerMetadata?: Record<string, unknown>;
}

export function cloneVoice(options: CloneVoiceOptions): Promise<ClonedVoice>;
```

### Decisions

- **Flat top-level function.** Matches `generateSpeech` / `streamSpeech` /
  `generateConversation`. No `voices.*` namespace. Management (list/delete) would
  arrive later as separate flat functions if needed.
- **Identity via `model`.** Same argument as `generateSpeech` — a factory
  `ResolvedModel`. The SDK reads `.provider`; `modelId` is ignored where cloning
  is provider-level and used only where a provider needs it. Cloning is
  provider-scoped for almost every provider (the lone model-binding case is
  Smallest, below).
- **`files` mirrors the inline forms** (`Uint8Array` / `{ audio }` / `{ url }`),
  plus optional per-file `transcript` (Inworld/Fish quality) and `mediaType`
  (multipart Content-Type, Mistral `sample_filename`). Accepts one value or an
  array. No Blob/File/streams.
- **`name` is required.** Every provider needs it; maps to `title` (Fish) /
  `displayName` (Inworld, Smallest) / `name`. For MiniMax it *is* the voice ID.
- **`language` is optional and defaults to `"en"`.** For the three providers that
  require it (Cartesia, xAI, Inworld), when it is defaulted the result carries a
  warning (e.g. `"cartesia requires a language; defaulted to 'en' — pass
  \`language\` if the sample isn't English"`). The other six ignore it.
- **Return is an object**, not a bare string (a string can't carry the language
  warning). `voiceId` drops straight into `generateSpeech({ voice })`. No
  `status` field in v1 — every Tier-1 clone is synchronous; `status` arrives with
  async Tier-2.
- **Never retries.** Cloning is a non-idempotent create; retrying a
  possibly-successful request spawns duplicate voices and exhausts provider
  slots. There is no `maxRetries` knob — a transient failure surfaces to the
  caller.
- **No `description` field.** Optional-everywhere, required-nowhere metadata is
  left to `providerOptions` (e.g. `providerOptions: { description }`) to keep the
  core surface minimal.

## Execution model

`cloneVoice()` owns the shared work, then delegates to a per-provider adapter:

1. Resolve `model` → provider; throw `VoiceCloningUnsupportedError` if it's a
   gateway/string model (factory-only in v1) or a provider without clone support.
2. Normalize `files` → `NormalizedSample[]` (`{ bytes, mediaType, transcript? }`):
   fetch `{ url }` (honoring `abortSignal`, deriving `mediaType` from
   `Content-Type`, throwing `CloneSampleFetchError` on failure), decode base64.
3. Validate structurally: non-empty `files`, non-empty `name`, sample count ≤
   provider max (`TooManyCloneSamplesError`), MiniMax name format
   (`InvalidCloneFieldError`). Audio length/size/quality is deferred to the
   provider and surfaced as `ApiError`.
4. Default+warn `language` for providers that require it.
5. Call the provider adapter, which marshals to the wire format and returns
   `{ voiceId, providerMetadata? }`.

```ts
interface SpeechProvider {
  // ...existing...
  cloneVoice?(options: {
    modelId: string;
    samples: NormalizedSample[];
    name: string;
    language?: string;
    providerOptions?: Record<string, unknown>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<{
    voiceId: string;
    providerMetadata?: Record<string, unknown>;
  }>;
  maxCloneSamples?(modelId: string): number; // for the count check; default 1
}
```

`providerOptions` are merged untransformed; `apiKey` is accepted at call-time;
`baseURL`/`fetch` come from the factory config; SDK reserves `Content-Type` /
`Authorization`. No change to `generateSpeech` — returned IDs are plain strings
that reuse the existing `voice` path (Fish's generate-time `model` header and
MiniMax's `voice_setting.voice_id` are already handled by the modelId).

## Capability discovery

Add `FEATURES.VOICE_CLONING` and tag clone-capable models, so callers can check
`hasFeature(model, "voice-cloning")` before calling. Calling `cloneVoice` on a
provider without the method throws `VoiceCloningUnsupportedError(provider,
reason)`.

## Errors (all extend `SpeechSDKError`, exported from `index.ts`)

- `VoiceCloningUnsupportedError(provider, reason)` — provider can't clone, or the
  string/gateway path was used in v1 (message points at the factory).
- `TooManyCloneSamplesError(provider, max, received)` — more samples than the
  provider accepts.
- `CloneSampleFetchError(url, cause)` — a `{ url }` sample failed to fetch.
- `InvalidCloneFieldError(provider, field, rule)` — e.g. a MiniMax `name` that
  violates the voice-ID format.

## Provider matrix (v1 scope — Tier 1, 9 providers)

All Tier-1 providers are synchronous and return a reusable ID consumed exactly
where `generateSpeech({ voice })` already sends it.

| Provider | Endpoint | Transport | Beyond `name` | Samples | ID field |
| --- | --- | --- | --- | --- | --- |
| ElevenLabs | `POST /v1/voices/add` | multipart | — | many | `voice_id` |
| Cartesia | `POST /voices/clone` | multipart | `language` | single | `id` |
| Fish Audio | `POST /model` | multipart | — (`title`) | many | `_id` |
| Mistral | `POST /v1/audio/voices` | JSON+base64 | — | single | `id` |
| Gradium | `POST /api/voices/` | multipart | — | single | `uid` |
| xAI | `POST /v1/custom-voices` | multipart | `language` | single | `voice_id` |
| Inworld | `POST /voices/v1/voices:clone` | JSON+base64 | `language` (→ locale enum) | many | `voice.voiceId` |
| Smallest AI | `POST /lightning-large/add_voice` | multipart | — (`displayName`) | single | `voiceId` |
| MiniMax | `files/upload` → `voice_clone` | multipart → JSON | `name` is the id | single | `name` (SDK-supplied) |

### Adapter notes

- **MiniMax** — two HTTP calls (upload sample → `file_id`, then `voice_clone`).
  The caller-assigned ID is **`name` used verbatim**, validated against MiniMax's
  rules (8–256 chars, letter-led, alphanumeric/`-`/`_`, no trailing `-`/`_`);
  a non-compliant `name` throws `InvalidCloneFieldError` — never silently
  transformed. No separate override.
- **Inworld** — requires `displayName` + `langCode`, where `langCode` is a
  **locale enum** (`EN_US`, …). The adapter maps BCP-47 `language` → locale via an
  SDK-owned table (Inworld offers one locale per language, so it's lossless),
  falls back to `AUTO` for unmapped codes, and accepts a `providerOptions.langCode`
  override. Samples sent as base64 in `voiceSamples[]`.
- **xAI / Cartesia** — `language` required; defaulted to `"en"` (+warning) when
  omitted. Cartesia clone uses `Cartesia-Version: 2026-03-01`.
- **Smallest** — the only model-binding case. The clone endpoint is on a separate
  host (`waves-api.smallest.ai`) under `lightning-large`, distinct from the
  generate `baseURL`; the adapter targets it regardless of the passed `modelId`.
  Current docs state cloned IDs (prefixed `voice_`) are usable with `lightning_v3.1`;
  an e2e test verifies this. If clones turn out not to be usable cross-model,
  Smallest drops to deferred. Any reported model-binding goes into `providerMetadata`.
- **Fish Audio** — `train_mode: "fast"` for instant; reused as `reference_id`
  plus the generate-time `model` header.

## Testing

- **Unit** per adapter: mocked `fetch` asserting endpoint, headers, wire shape
  (multipart vs base64), and ID extraction; plus core tests for normalization,
  URL fetch, count/name validation, language default+warning, unsupported-provider
  throw.
- **E2E** behind provider keys for a representative subset (incl. Smallest's
  cross-model usability and MiniMax's two-step flow).

## Deferred

- **Tier 2 — Resemble, fal.** Resemble is URL-only (`dataset_url`), async
  (poll/webhook), Business-plan + consent gated. fal's persisted clone
  (`fal-ai/minimax/voice-clone`) is URL-only, queue-async, and auto-deletes after
  7 days if unused. Both need a URL-hosting story and an async/`status` concept.
- **Tier 3 — unsupported, throws `VoiceCloningUnsupportedError`:**
  - **Hume** — API only persists *designed* voices / a prior `generation_id`; no
    audio-upload clone (UI only).
  - **OpenAI** — real 2-step API but gated to "eligible customers".
  - **Google** — Gemini TTS (integrated here) has no cloning; Cloud TTS Instant
    Custom Voice is a different host + OAuth + client-held key.
  - **Deepgram** — fixed voices only.
  - **Murf** — manual enterprise service, no endpoint.
- Gateway `POST /v1/voices` → unlock the string-model path.
- Voice-management helpers (`listVoices` / `deleteVoice`).

## Follow-up doc fixes

`inworld.md`, `gradium.md`, `murf.md`, `openai.md`, and `google.md` currently
assert "Voice Cloning: No" — several are now inaccurate (Inworld/Gradium support
it; OpenAI/Google have gated/separate offerings).
</content>
