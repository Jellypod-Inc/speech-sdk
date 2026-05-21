# Smallest AI

| | |
| --- | --- |
| Prefix | `smallest-ai` |
| Default model | `lightning-v3.1` |
| Env var | `SMALLEST_API_KEY` |
| Official docs | https://waves.smallest.ai/ |

## Models

| Model                | Streaming | Audio Tags | Voice Cloning | Native Timestamps | Notes                                          |
| -------------------- | --------- | ---------- | ------------- | ----------------- | ---------------------------------------------- |
| `lightning-v3.1`     | No        | No         | No            | No                | 44 kHz, 15 languages, auto language detection  |
| `lightning_v3.1_pro` | No        | No         | No            | No                | 44 kHz, English + Hindi, curated Pro voice catalog |

Streaming is not supported — `streamSpeech` throws `StreamingNotSupportedError`. `timestamps: true` on a direct factory falls back to the default Whisper STT pass.

## Usage

### lightning-v3.1

```ts
await generateSpeech({
  model: "smallest-ai/lightning-v3.1",
  text: "Hello!",
  voice: "magnus",
})
```

Default voice: `magnus`. Supported language tags: `en`, `hi`, `es`, `ta`, `kn`, `te`, `ml`, `mr`, `gu`, `fr`, `it`, `nl`, `sv`, `pt`, `de`. Pass `language: "auto"` (SDK default) for automatic detection.

### lightning_v3.1_pro

```ts
await generateSpeech({
  model: "smallest-ai/lightning_v3.1_pro",
  text: "Hello from Pro!",
  voice: "meher",
})
```

Default voice: `meher`. Supported languages: `en`, `hi` (Indian voices code-switch; British and American voices are English-only). The `model: "lightning_v3.1_pro"` field is injected into the request body automatically — do not set it via `providerOptions`.

Pro voice catalog: Indian female — `rhea`, `zariya`, `kareena`, `mishka`, `inaaya`, `saira`, `meher`, `aarini`; Indian male — `aviraj`, `vyom`, `zoravar`, `reyansh`, `ahan`; British female — `cressida`, `elowen`, `ottilie`, `seraphina`, `tabitha`, `arabella`; British male — `benedict`, `cormac`, `everett`, `finley`, `rupert`, `winston`, `caspian`; American female — `willow`, `autumn`, `skylar`, `savannah`, `kennedy`, `reagan`, `sierra`; American male — `maverick`, `brooks`, `hunter`, `colton`, `wesley`, `asher`.

## Provider Options

```ts
await generateSpeech({
  model: "smallest-ai/lightning-v3.1",
  text: "Hello!",
  voice: "magnus",
  providerOptions: {
    output_format: "wav",  // wav (default) | mp3 | pcm | mulaw
    sample_rate: 24_000,
    language: "auto",      // auto (default) | en | hi | es | ta | ...
  },
})
```

## Output Formats

`output: { format: "wav" | "pcm" | "mp3" }` is supported natively at 24 kHz for both models. The SDK forwards the chosen format to the provider as `output_format`.

## Factory

```ts
import { createSmallestAI } from "@speech-sdk/core/providers"
const smallest = createSmallestAI({ apiKey: process.env.SMALLEST_API_KEY })

// Standard model
await generateSpeech({ model: smallest("lightning-v3.1"), text: "...", voice: "magnus" })

// Pro model
await generateSpeech({ model: smallest("lightning_v3.1_pro"), text: "...", voice: "meher" })
```
