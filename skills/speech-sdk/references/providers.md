# All Providers

SpeechSDK supports many upstream providers. `provider/model` strings (e.g. `"<prefix>/<model>"`) read `SPEECH_GATEWAY_API_KEY` and dispatch to the hosted backend. Provider factories (`create<Name>()`) call upstream providers directly with provider-specific keys. Passing just `"<prefix>"` (no `/model`) uses each provider's current default — see `providers/<name>.md` for what that resolves to. Some providers have no default and require an explicit model path.

## Provider Table

| Provider     | Prefix         | Env Var                |
| ------------ | -------------- | ---------------------- |
| OpenAI       | `openai`       | `OPENAI_API_KEY`       |
| ElevenLabs   | `elevenlabs`   | `ELEVENLABS_API_KEY`   |
| Deepgram     | `deepgram`     | `DEEPGRAM_API_KEY`     |
| Cartesia     | `cartesia`     | `CARTESIA_API_KEY`     |
| Hume         | `hume`         | `HUME_API_KEY`         |
| Google       | `google`       | `GOOGLE_API_KEY`       |
| Fish Audio   | `fish-audio`   | `FISH_AUDIO_API_KEY`   |
| Inworld      | `inworld`      | `INWORLD_API_KEY`      |
| Murf         | `murf`         | `MURF_API_KEY`         |
| Resemble     | `resemble`     | `RESEMBLE_API_KEY`     |
| fal          | `fal-ai`       | `FAL_API_KEY`          |
| Mistral      | `mistral`      | `MISTRAL_API_KEY`      |
| xAI          | `xai`          | `XAI_API_KEY`          |
| Smallest AI  | `smallest-ai`  | `SMALLEST_API_KEY`     |

## Capability Matrix

| Provider    | Streaming      | Audio Tags            | Voice Cloning  | Timestamps  | Open Source |
| ----------- | -------------- | --------------------- | -------------- | ----------- | ----------- |
| OpenAI      | Yes            | Yes (as instructions) | No             | Via STT     | No          |
| ElevenLabs  | Yes            | Yes                   | No (inline)    | Native      | No          |
| Deepgram    | Yes            | No                    | No             | Via STT     | No          |
| Cartesia    | Yes            | Yes                   | Yes            | Native      | No          |
| Hume        | Yes            | No                    | Yes            | Native      | No          |
| Google      | Yes            | Model-specific        | No             | Via STT     | No          |
| Fish Audio  | Yes            | Yes                   | Yes            | Via STT     | Yes         |
| Inworld     | Yes            | No                    | No             | Native      | No          |
| Murf        | Yes            | No                    | No             | Native      | No          |
| Resemble    | Yes            | No                    | Yes            | Native      | Yes         |
| fal         | No             | No                    | Model-specific | Via STT     | Yes         |
| Mistral     | Yes            | No                    | Yes            | Via STT     | Yes         |
| xAI         | Yes            | Yes                   | No             | Via STT     | No          |
| Smallest AI | No             | No                    | No             | Via STT     | No          |

Capabilities are per-model — see each provider file in `providers/<name>.md` for which models within a provider support what.

**Timestamps column legend:**

- **Native** — TTS response carries word alignment for at least some of this provider's models. `timestamps: true` uses the native path with no STT round-trip when the chosen model supports it.
- **Via STT** — no native alignment. `timestamps: true` transcribes the synthesized audio via the SDK's default STT fallback (or the factory's `fallbackSTT` override). Direct path only.

See `timestamps.md` for the full cascade and overrides.

## Usage

```ts
import { generateSpeech } from "@speech-sdk/core"

// provider/model string
await generateSpeech({
  model: "<prefix>/<model>",
  text: "Hello!",
  voice: "voice-id",
})

// just the provider uses its default model
await generateSpeech({
  model: "<prefix>",
  text: "Hello!",
  voice: "voice-id",
})
```

## Provider Options

Each provider accepts provider-specific parameters via `providerOptions`. These are forwarded directly using the provider API's own field names — no transformation. See `providers/<name>.md` for the exact accepted shape per provider.

```ts
await generateSpeech({
  model: "<prefix>/<model>",
  text: "Hello!",
  voice: "voice-id",
  providerOptions: { /* provider-specific fields */ },
})
```

## API Key Resolution

String models read `SPEECH_GATEWAY_API_KEY` or use the `apiKey` option. Direct factory models read the upstream provider env var in the table above, or use the factory's `apiKey` config. See `configuration.md`.
