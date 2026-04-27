# Deepgram

| | |
| --- | --- |
| Prefix | `deepgram` |
| Default model | `aura-2` |
| Env var | `DEEPGRAM_API_KEY` |
| Official docs | https://developers.deepgram.com/docs/text-to-speech |

## Models

| Model    | Streaming | Audio Tags | Voice Cloning | Notes               |
| -------- | --------- | ---------- | ------------- | ------------------- |
| `aura-2` | Yes       | No         | No            | Current default     |
| `aura`   | Yes       | No         | No            | Previous generation |

## Usage

```ts
await generateSpeech({
  model: "deepgram/aura-2",
  text: "Hello!",
  voice: "thalia-en",
})
```

Deepgram's API expects the voice concatenated with the model (`aura-2-thalia-en`). SpeechSDK builds that identifier from the `voice` suffix — pass `thalia-en`, `apollo-en`, `orion-en`, etc.

## Provider Options

Sent as URL query parameters:

```ts
await generateSpeech({
  model: "deepgram/aura-2",
  text: "Hello!",
  voice: "thalia-en",
  providerOptions: {
    encoding: "mp3",
    sample_rate: 24_000,
    container: "none",
  },
})
```

## Factory

```ts
import { createDeepgram } from "@speech-sdk/core/providers"
const deepgram = createDeepgram({ apiKey: process.env.DEEPGRAM_API_KEY })
await generateSpeech({ model: deepgram("aura-2"), text: "...", voice: "thalia-en" })
```
