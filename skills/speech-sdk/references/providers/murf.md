# Murf

| | |
| --- | --- |
| Prefix | `murf` |
| Default model | `GEN2` |
| Env var | `MURF_API_KEY` |
| Official docs | https://murf.ai/api/docs |

## Models

| Model    | Streaming | Audio Tags | Voice Cloning | Notes                     |
| -------- | --------- | ---------- | ------------- | ------------------------- |
| `GEN2`   | No        | No         | No            | Default; multilingual     |
| `FALCON` | No        | No         | No            | Low-latency, English only |

Each model uses a different endpoint — SpeechSDK routes based on the model you pick.

## Usage

```ts
await generateSpeech({
  model: "murf/GEN2",
  text: "Hello!",
  voice: "en-US-natalie",
})
```

## Provider Options

```ts
await generateSpeech({
  model: "murf/GEN2",
  text: "Hello!",
  voice: "en-US-natalie",
  providerOptions: {
    format: "MP3",
    sampleRate: 44_100,
    style: "Conversational",
    pitch: 0,
    rate: 0,
  },
})
```

## Factory

```ts
import { createMurf } from "@speech-sdk/core/murf"
const murf = createMurf({ apiKey: process.env.MURF_API_KEY })
```
