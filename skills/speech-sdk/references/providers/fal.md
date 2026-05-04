# fal

| | |
| --- | --- |
| Prefix | `fal-ai` |
| Default model | *(user-specified)* |
| Env var | `FAL_API_KEY` |
| Official docs | https://fal.ai/models |

fal.ai is a marketplace — no default TTS model. Common choices: `f5-tts`, `kokoro`, `orpheus-tts`.

## Models

| Model         | Streaming | Voice Cloning | Open Source | Notes                                   |
| ------------- | --------- | ------------- | ----------- | --------------------------------------- |
| `f5-tts`      | No        | Yes           | Yes         | Zero-shot voice cloning; `maxInputChars: 5000` |
| `kokoro`      | No        | No            | Yes         | Lightweight English / multilingual      |
| `orpheus-tts` | No        | No            | Yes         | Expressive English / European languages |

Streaming is not supported on any fal model — `streamSpeech` throws `StreamingNotSupportedError`.

## Usage

```ts
// String form: provider prefix + model id
await generateSpeech({
  model: "fal-ai/f5-tts",
  text: "Hello!",
  voice: { url: "https://example.com/reference.wav" },
})
```

The provider prefix is `fal-ai`, the model id is just the bare name (e.g. `f5-tts`). The SDK builds the upstream URL `https://fal.run/fal-ai/<modelId>`.

## Voice Cloning

`f5-tts` accepts a string voice ID, `{ url }`, or `{ audio }` (base64 / `Uint8Array`). `kokoro` and `orpheus-tts` do not support inline cloning.

```ts
// from URL
voice: { url: "https://example.com/reference.wav" }

// from bytes
import { readFileSync } from "fs"
voice: { audio: readFileSync("./reference.wav") }
```

## Factory

```ts
import { createFal } from "@speech-sdk/core/providers"
const fal = createFal({ apiKey: process.env.FAL_API_KEY })
await generateSpeech({ model: fal("f5-tts"), text: "...", voice: { url: "..." } })
```

The factory call takes the bare model id (`fal("f5-tts")`), not `fal("fal-ai/f5-tts")`. The `fal-ai/` prefix only applies when using the gateway string form.
