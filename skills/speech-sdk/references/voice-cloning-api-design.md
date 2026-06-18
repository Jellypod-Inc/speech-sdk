# Voice Cloning API — Design Proposal

Status: **proposal / not yet implemented.** This documents the design for a new
top-level `cloneVoice()` function that creates a **persisted** cloned voice on a
provider from one or more audio samples, returning a reusable voice ID.

This is distinct from the existing **inline** cloning (`voice: { audio }` /
`{ url }` on `generateSpeech`, see `voice-cloning.md`), which mimics reference
audio for a single generation and saves nothing.

## Goal

```ts
import { cloneVoice, generateSpeech } from "@speech-sdk/core";

const voice = await cloneVoice({
  model: elevenlabs("eleven_multilingual_v2"), // factory-resolved (see "Dispatch")
  files: [readFileSync("./sample.wav")],
  name: "Pierson",
});

await generateSpeech({
  model: elevenlabs("eleven_multilingual_v2"),
  voice: voice.voiceId,
  text: "Hello in my own voice!",
});
```

`{ model, files, name }` is all most callers ever touch. Everything a specific
provider additionally demands (a language code, a self-assigned ID, base64 vs
multipart transport, a locale enum) is absorbed by the per-provider adapter.

## Public surface

```ts
export type VoiceSample =
  | Uint8Array
  | { audio: string | Uint8Array; mediaType?: string; transcript?: string }
  | { url: string; transcript?: string };

export interface CloneVoiceOptions<
  M extends string | ResolvedModel = string | ResolvedModel,
> {
  model: M;
  files: VoiceSample | VoiceSample[];
  name: string;
  language?: string; // BCP-47 ("en"); required only by some providers
  description?: string;
  providerOptions?: Record<string, unknown>;
  apiKey?: string;
  abortSignal?: AbortSignal;
  headers?: Record<string, string>;
}

export interface ClonedVoice {
  voiceId: string;
  provider: string;
  status: "ready" | "pending";
  providerMetadata?: Record<string, unknown>;
}

export function cloneVoice(options: CloneVoiceOptions): Promise<ClonedVoice>;
```

Design choices:

- **`name` is required** in the type. Every supported provider requires a name
  (Fish calls it `title`, Inworld/Smallest call it `displayName`). Forcing it is
  more predictable than synthesizing one.
- **`language` is optional** in the type but enforced per-provider. Cartesia,
  xAI, and Inworld require it; the adapter throws `MissingCloneFieldError` with a
  precise message if it's missing. Always BCP-47 on the SDK surface — the adapter
  maps to the provider's form.
- **`files` accepts one or many**, as bytes / base64 / `{ url }`, normalized
  internally to each provider's wire format.
- **Return is a flat `{ voiceId }`** — a plain string reusable directly in
  `generateSpeech({ voice })`. No provider-specific wrapper leaks out.

## Provider interface addition

```ts
interface SpeechProvider {
  // ...existing...
  cloneVoice?(options: {
    modelId: string;
    samples: NormalizedSample[]; // bytes + optional mediaType/transcript
    name: string;
    language?: string;
    description?: string;
    providerOptions?: Record<string, unknown>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<{
    voiceId: string;
    status: "ready" | "pending";
    providerMetadata?: Record<string, unknown>;
  }>;
}
```

Add `FEATURES.VOICE_CLONING` and tag clone-capable models. `cloneVoice()` throws
`VoiceCloningUnsupportedError(provider, reason)` when the provider lacks the
method.

## Dispatch (gateway invariant)

v1 is **factory-only**. A bare `"provider/model"` string routes through
`SpeechGatewayProvider`, which must stay byte-equivalent to `curl`-ing
`api.speechbase.ai`. Until the gateway server exposes a `POST /v1/voices`
equivalent, the SDK cannot clone over the gateway without adding client-side
behavior that violates the gateway invariant. So:

- `cloneVoice({ model: elevenlabs("...") })` → direct provider. Supported.
- `cloneVoice({ model: "elevenlabs/..." })` → throws `VoiceCloningUnsupportedError`
  on the gateway path with a message pointing at the factory, until the gateway
  endpoint ships.

## Provider matrix (v1 scope — Tier 1, 9 providers)

All Tier 1 providers are synchronous (`status: "ready"`) and return a reusable ID
consumed exactly where `generateSpeech({ voice })` already sends it.

| Provider | Endpoint | Transport | Beyond `name` | Files | ID field |
| --- | --- | --- | --- | --- | --- |
| ElevenLabs | `POST /v1/voices/add` | multipart | — | many | `voice_id` |
| Cartesia | `POST /voices/clone` | multipart | `language` | single | `id` |
| Fish Audio | `POST /model` | multipart | — (`title`) | many | `_id` |
| Mistral | `POST /v1/audio/voices` | JSON+base64 | — | single | `id` |
| Gradium | `POST /api/voices/` | multipart | — | single | `uid` |
| xAI | `POST /v1/custom-voices` | multipart | `language` | single | `voice_id` |
| Inworld | `POST /voices/v1/voices:clone` | JSON+base64 | `language` (→ locale enum) | many | `voice.voiceId` |
| Smallest AI | `POST /lightning-large/add_voice` | multipart | — (`displayName`) | single | `voiceId` |
| MiniMax | `files/upload` → `voice_clone` | multipart → JSON | self-assigned id | single | *(SDK-assigned)* |

### Provider wrinkles the adapter absorbs

- **MiniMax** — two HTTP calls (upload sample → `file_id`, then `voice_clone`),
  and the caller must invent the ID (8–256 chars, letter-led, alphanumeric/`-`/`_`).
  The adapter derives a compliant ID from `name` (+ random suffix), submits both
  calls, and returns that ID as `voiceId`. Override via `providerOptions.voiceId`.
- **Inworld** — requires `displayName` + `langCode`, where `langCode` is a
  **locale enum** (`EN_US`, `ES_ES`, …), not BCP-47. The adapter maps `language:
  "en"` → `EN_US` via a table and falls back to `AUTO` for unmapped codes; sends
  samples as base64 in `voiceSamples[]`.
- **xAI** — `name` + `language` (BCP-47) + single multipart `file` → `voice_id`.
  Cleanest fit; same API key as TTS.
- **Cartesia** — `language` required; also bump `Cartesia-Version` to the current
  `2026-03-01` for the clone call.
- **Smallest AI** — clone lives on a different host (`waves-api.smallest.ai`) and
  is bound to the `lightning-large` model; the resulting voice must be generated
  with that model, not the registered `lightning_v3.1`.
- **Fish Audio** — `train_mode: "fast"` for instant; reused as `reference_id`
  plus the `model` header at generate time.

## Deferred

- **Tier 2 — Resemble, fal.** Resemble is URL-only (`dataset_url`, no raw bytes),
  async (poll/webhook), and Business-plan + consent gated. fal's persisted clone
  (`fal-ai/minimax/voice-clone`) is URL-only, queue-async, and **auto-deletes
  after 7 days if unused**. Both need a URL-hosting story and an async/polling
  concept; passing raw bytes throws `CloneRequiresUrlError` until then.
- **Tier 3 — unsupported, throws `VoiceCloningUnsupportedError`:**
  - **Hume** — API only persists *designed* voices / prior `generation_id`; no
    audio-upload clone (UI only).
  - **OpenAI** — real 2-step API but gated to "eligible customers" (contact sales).
  - **Google** — Gemini TTS (integrated here) has no cloning; Cloud TTS Instant
    Custom Voice is a different host + OAuth + client-held key.
  - **Deepgram** — fixed voices only.
  - **Murf** — manual enterprise service, no endpoint.

## New errors

- `VoiceCloningUnsupportedError(provider, reason)` — provider/model can't clone,
  or string/gateway path used in v1.
- `MissingCloneFieldError(provider, field)` — e.g. Cartesia/xAI/Inworld without
  `language`.
- `CloneRequiresUrlError(provider)` — Tier 2 provider given raw bytes (deferred).

## Open follow-ups

1. Gateway `POST /v1/voices` endpoint → unlock the string-model path.
2. Tier 2 async + URL-hosting support.
3. Optional voice-management helpers (`listVoices` / `deleteVoice`) — every Tier 1
   provider exposes them.
</content>
</invoke>
