# Smallest AI

| | |
| --- | --- |
| Prefix | `smallest-ai` |
| Default model | `lightning-v3.1` |
| Env var | `SMALLEST_API_KEY` |
| Official docs | https://waves.smallest.ai/ |

## Models

| Model            | Streaming | Audio Tags | Voice Cloning | Native Timestamps | Notes                              |
| ---------------- | --------- | ---------- | ------------- | ----------------- | ---------------------------------- |
| `lightning-v3.1` | No        | No         | No            | No                | Fast English / Hindi / Spanish / Tamil |

Streaming is not supported — `streamSpeech` throws `StreamingNotSupportedError`. `timestamps: true` on a direct factory falls back to the default Whisper STT pass.

## Usage

```ts
await generateSpeech({
  model: "smallest-ai/lightning-v3.1",
  text: "Hello!",
  voice: "magnus",
})
```

The default voice (when `voice` is omitted) is `magnus`. Supported language tags: `en`, `hi`, `es`, `ta`. The provider's API also accepts `language: "auto"`, which is the SDK default.

## Provider Options

```ts
await generateSpeech({
  model: "smallest-ai/lightning-v3.1",
  text: "Hello!",
  voice: "magnus",
  providerOptions: {
    output_format: "wav",  // wav (default) | mp3 | pcm | mulaw
    sample_rate: 24_000,
    language: "auto",      // auto (default) | en | hi | es | ta
  },
})
```

## Output Formats

`output: { format: "wav" | "pcm" | "mp3" }` is supported natively at 24 kHz. The SDK forwards the chosen format to the provider as `output_format`.

## Factory

```ts
import { createSmallestAI } from "@speech-sdk/core/providers"
const smallest = createSmallestAI({ apiKey: process.env.SMALLEST_API_KEY })
await generateSpeech({ model: smallest("lightning-v3.1"), text: "...", voice: "magnus" })
```
