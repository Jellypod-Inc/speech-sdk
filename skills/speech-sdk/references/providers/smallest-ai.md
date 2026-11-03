# Smallest AI

| | |
| --- | --- |
| Prefix | `smallest-ai` |
| Default model | `lightning_v3.1_pro` |
| Env var | `SMALLEST_API_KEY` |
| Official docs | https://docs.smallest.ai/ |

## Models

| Model                | Streaming | Audio Tags | Voice Cloning | Native Timestamps | Notes                                          |
| -------------------- | --------- | ---------- | ------------- | ----------------- | ---------------------------------------------- |
| `lightning_v3.1`     | No        | No         | Yes           | No                | Retires 2026-11-30; served by `lightning_v3.1_pro` after that |
| `lightning_v3.1_pro` | No        | No         | No            | No                | 44 kHz, English + Hindi, curated Pro voice catalog |

Streaming is not supported — `streamSpeech` throws `StreamingNotSupportedError`. `timestamps: true` on a direct factory falls back to the default Whisper STT pass.

## Usage

### lightning_v3.1_pro

```ts
await generateSpeech({
  model: "smallest-ai/lightning_v3.1_pro",
  text: "Hello from Pro!",
  voice: "meher",
})
```

Default voice: `meher`. Supported languages: `en`, `hi` (Indian voices code-switch; British and American voices are English-only). The `model: "lightning_v3.1_pro"` field is injected into the request body automatically — do not set it via `providerOptions`.

Pro voice catalog (see the [Lightning v3.1 Pro model card](https://docs.smallest.ai/waves/model-cards/text-to-speech/lightning-v-3-1-pro) for the full list): Indian female — `rhea`, `zariya`, `kareena`, `mishka`, `inaaya`, `saira`, `meher`, `aarini`; Indian male — `aviraj`, `vyom`, `zoravar`, `reyansh`, `ahan`; British female — `sophie`, `ellie`, `cressida`, `ottilie`, `elowen`, `seraphina`; British male — `sam`, `henry`, `benedict`, `cormac`, `rupert`, `finley`; American female — `kaitlyn`, `savannah`, `amelia`, `zoe`, `ruby`, `leah`, `jenna`, `kate`, `molly`, `sara`, `fiona`; American male — `blake`, `austin`, `henry`, `jack`, `leo`, `luke`, `owen`.

### lightning_v3.1 (retiring)

`lightning_v3.1` and its standard voice pool (`magnus`, etc.) retire on 2026-11-30 18:30 UTC. After that, `lightning_v3.1` requests are served by `lightning_v3.1_pro`, so use a Pro voice. Both models go to the unified `POST /waves/v1/tts` endpoint; the model is set in the request body.

## Provider Options

```ts
await generateSpeech({
  model: "smallest-ai/lightning_v3.1_pro",
  text: "Hello!",
  voice: "meher",
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

await generateSpeech({ model: smallest("lightning_v3.1_pro"), text: "...", voice: "meher" })
```
