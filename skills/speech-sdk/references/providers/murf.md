# Murf

| | |
| --- | --- |
| Prefix | `murf` |
| Default model | `GEN2` |
| Env var | `MURF_API_KEY` |
| Official docs | https://murf.ai/api/docs |

## Models

| Model    | Streaming | Audio Tags | Voice Cloning | Native Timestamps | Notes                     |
| -------- | --------- | ---------- | ------------- | ----------------- | ------------------------- |
| `GEN2`   | No        | No         | No            | Yes               | Default; multilingual     |
| `FALCON` | Yes       | No         | No            | No                | Low-latency, English only |

Each model uses a different endpoint — SpeechSDK routes based on the model you pick.

## Timestamps

`GEN2` returns word-level timing natively in the same response — `wordDurations[].{startMs, endMs, word}` are converted to the SDK's seconds-based `WordTimestamp[]`. No extra request, no STT round-trip.

```ts
const result = await generateSpeech({
  model: "murf/GEN2",
  text: "Hello, world!",
  voice: "en-US-natalie",
  timestamps: "auto",
})
result.timestamps // [{ text: "Hello,", start: 0, end: 0.42 }, ...]
```

`FALCON` uses the streaming endpoint which returns audio bytes only; with `timestamps: "on"` it falls back to the default Whisper STT pass.

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
