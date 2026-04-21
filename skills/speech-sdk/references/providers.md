# All Providers

SpeechSDK supports 13 providers. Use `provider/model` strings, or pass just the provider name to use its default model. (fal has no default model — you must always pass a specific `fal-ai/<model>` path.)

## Provider Table

| Provider     | Prefix         | Default Model                    | Env Var                |
| ------------ | -------------- | -------------------------------- | ---------------------- |
| OpenAI       | `openai`       | `gpt-4o-mini-tts`                | `OPENAI_API_KEY`       |
| ElevenLabs   | `elevenlabs`   | `eleven_multilingual_v2`         | `ELEVENLABS_API_KEY`   |
| Deepgram     | `deepgram`     | `aura-2`                         | `DEEPGRAM_API_KEY`     |
| Cartesia     | `cartesia`     | `sonic-3`                        | `CARTESIA_API_KEY`     |
| Hume         | `hume`         | `octave-2`                       | `HUME_API_KEY`         |
| Google       | `google`       | `gemini-2.5-flash-preview-tts`   | `GOOGLE_API_KEY`       |
| Fish Audio   | `fish-audio`   | `s2-pro`                         | `FISH_AUDIO_API_KEY`   |
| Inworld      | `inworld`      | `inworld-tts-1.5-max`            | `INWORLD_API_KEY`      |
| Murf         | `murf`         | `GEN2`                           | `MURF_API_KEY`         |
| Resemble     | `resemble`     | `default`                        | `RESEMBLE_API_KEY`     |
| fal          | `fal-ai`       | *(user-specified)*               | `FAL_API_KEY`          |
| Mistral      | `mistral`      | `voxtral-mini-tts-2603`          | `MISTRAL_API_KEY`      |
| xAI          | `xai`          | `grok-tts`                       | `XAI_API_KEY`          |

## Capability Matrix

| Provider    | Streaming | Audio Tags              | Voice Cloning       | Timestamps           | Open Source |
| ----------- | --------- | ----------------------- | ------------------- | -------------------- | ----------- |
| OpenAI      | Yes       | Yes (as instructions)   | No                  | Derived (declared)   | No          |
| ElevenLabs  | Yes       | Yes (`eleven_v3`)       | No                  | **Native**           | No          |
| Deepgram    | Yes       | No                      | No                  | STT fallback only    | No          |
| Cartesia    | Yes       | Yes (`sonic-3`)         | Yes (`sonic-3`)     | STT fallback only    | No          |
| Hume        | Yes       | No                      | Yes (`octave-2`)    | STT fallback only    | No          |
| Google      | Yes       | No                      | No                  | STT fallback only    | No          |
| Fish Audio  | Yes       | Yes                     | Yes                 | STT fallback only    | Yes         |
| Inworld     | Yes       | No                      | No                  | STT fallback only    | No          |
| Murf        | No        | No                      | No                  | STT fallback only    | No          |
| Resemble    | Yes       | No                      | Yes                 | STT fallback only    | Yes         |
| fal         | No        | No                      | Yes (select models) | STT fallback only    | Varies      |
| Mistral     | No        | No                      | Yes                 | STT fallback only    | Yes         |
| xAI         | Yes       | Yes (`grok-tts`)        | No                  | STT fallback only    | No          |

Support is per-model — see each provider file in `providers/<name>.md`.

**Timestamps column legend:**

- **Native** — the TTS endpoint itself returns word alignment. Free on `timestamps: "auto"`. Currently: ElevenLabs (`eleven_v3`, `eleven_multilingual_v2`, `eleven_flash_v2`, `eleven_flash_v2_5`).
- **Derived (declared)** — the model declares `{ id: "timestamps", mode: "derived" }`. The SDK transcribes the synthesized audio via STT on `timestamps: "on"`. Currently: OpenAI (`gpt-4o-mini-tts`, `tts-1`, `tts-1-hd`).
- **STT fallback only** — no declared capability. `timestamps: "on"` still works, routing through the default `timestampProvider` (OpenAI Whisper `openai/whisper-1`) or the caller's override. `timestamps: "auto"` returns `undefined`.

See `timestamps.md` for the full cascade and overrides.

## Usage

```ts
import { generateSpeech } from "@speech-sdk/core"

// provider/model string
await generateSpeech({
  model: "openai/gpt-4o-mini-tts",
  text: "Hello!",
  voice: "alloy",
})

// just the provider uses its default model
await generateSpeech({
  model: "elevenlabs",
  text: "Hello!",
  voice: "EXAVITQu4vr4xnSDxMaL",
})
```

## Provider Options

Each provider accepts provider-specific parameters via `providerOptions`. These are forwarded directly using the provider API's own field names — no transformation.

```ts
await generateSpeech({
  model: "openai/gpt-4o-mini-tts",
  text: "Hello!",
  voice: "alloy",
  providerOptions: { speed: 1.2, response_format: "opus" },
})
```

## API Key Resolution

String models read the key from the env var in the table above. Override with factory functions — see `configuration.md`.
