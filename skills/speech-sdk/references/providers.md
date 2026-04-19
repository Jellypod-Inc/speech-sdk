# All Providers

SpeechSDK supports 13 providers. Use `provider/model` strings, or pass just the provider name to use its default model.

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

| Provider    | Streaming | Audio Tags              | Voice Cloning       | Open Source |
| ----------- | --------- | ----------------------- | ------------------- | ----------- |
| OpenAI      | Yes       | Yes (as instructions)   | No                  | No          |
| ElevenLabs  | Yes       | Yes (`eleven_v3`)       | No                  | No          |
| Deepgram    | Yes       | No                      | No                  | No          |
| Cartesia    | Yes       | Yes (`sonic-3`)         | Yes (`sonic-3`)     | No          |
| Hume        | Yes       | No                      | Yes (`octave-2`)    | No          |
| Google      | Yes       | No                      | No                  | No          |
| Fish Audio  | Yes       | Yes                     | Yes                 | Yes         |
| Inworld     | Yes       | No                      | No                  | No          |
| Murf        | No        | No                      | No                  | No          |
| Resemble    | Yes       | No                      | Yes                 | Yes         |
| fal         | No        | No                      | Yes (select models) | Varies      |
| Mistral     | No        | No                      | Yes                 | Yes         |
| xAI         | Yes       | Yes (`grok-tts`)        | No                  | No          |

Support is per-model — see each provider file in `providers/<name>.md`.

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
