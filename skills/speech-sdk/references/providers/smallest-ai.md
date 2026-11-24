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
| `lightning_v3.1_pro` | No        | No         | Yes           | No                | 44 kHz, 31 languages, curated Pro voice catalog |

Streaming is not supported — `streamSpeech` throws `StreamingNotSupportedError`. `timestamps: true` on a direct factory falls back to the default Whisper STT pass.

## Usage

### lightning_v3.1_pro

```ts
await generateSpeech({
  model: "smallest-ai/lightning_v3.1_pro",
  text: "Hello from Pro!",
  voice: "kaitlyn",
})
```

Default voice: `kaitlyn`. Supported languages: `en`, `hi` (native code-switching between Indian-accented English and Hindi within one utterance), plus `mr`, `ta`, `ml`, `te`, `kn`, `pa`, `bn`, `or`, `gu`, `ar`, `zh`, `id`, `ja`, `ko`, `ms`, `tr`, `vi`, `de`, `es`, `fr`, `it`, `nl`, `sv`, `pt`, `ru`, `el`, `fi`, `no`, `pl` — 31 languages total. `language: "auto"` (the default) routes across all of them using any English or Hindi voice. The `model: "lightning_v3.1_pro"` field is injected into the request body automatically — do not set it via `providerOptions`.

Pro voice catalog (see the [Lightning v3.1 Pro model card](https://docs.smallest.ai/waves/model-cards/text-to-speech/lightning-v-3-1-pro) for the full list): Indian female — `rhea`, `zariya`, `kareena`, `mishka`, `inaaya`, `saira`, `meher`, `aarini`; Indian male — `aviraj`, `vyom`, `zoravar`, `reyansh`, `ahan`; British female — `sophie`, `ellie`, `cressida`, `ottilie`, `elowen`, `seraphina`; British male — `sam`, `henry`, `benedict`, `cormac`, `rupert`, `finley`; American female — `kaitlyn`, `savannah`, `amelia`, `zoe`, `ruby`, `leah`, `jenna`, `kate`, `molly`, `sara`, `fiona`; American male — `blake`, `austin`, `henry`, `jack`, `leo`, `luke`, `owen`.

## Provider Options

```ts
await generateSpeech({
  model: "smallest-ai/lightning_v3.1_pro",
  text: "Hello!",
  voice: "kaitlyn",
  providerOptions: {
    output_format: "wav",  // wav (default) | mp3 | pcm | mulaw
    sample_rate: 24_000,
    language: "auto",      // auto (default) | en | hi | es | ta | ...
  },
})
```

## Output Formats

`output: { format: "wav" | "pcm" | "mp3" }` is supported natively at 24 kHz. The SDK forwards the chosen format to the provider as `output_format`.

## Factory

```ts
import { createSmallestAI } from "@speech-sdk/core/providers"
const smallest = createSmallestAI({ apiKey: process.env.SMALLEST_API_KEY })

await generateSpeech({ model: smallest("lightning_v3.1_pro"), text: "...", voice: "kaitlyn" })
```
