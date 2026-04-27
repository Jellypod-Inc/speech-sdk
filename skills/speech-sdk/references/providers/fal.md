# fal

| | |
| --- | --- |
| Prefix | `fal-ai` |
| Default model | *(user-specified)* |
| Env var | `FAL_API_KEY` |
| Official docs | https://fal.ai/models |

fal.ai is a marketplace — no default TTS model. Common choices: `fal-ai/f5-tts`, `fal-ai/index-tts-2`.

## Models

| Model                | Streaming | Voice Cloning | Open Source | Notes                   |
| -------------------- | --------- | ------------- | ----------- | ----------------------- |
| `fal-ai/f5-tts`      | No        | Yes           | Yes         | Zero-shot voice cloning |
| `fal-ai/index-tts-2` | No        | Yes           | Yes         | Multi-speaker           |

Streaming is not supported — `streamSpeech` throws `StreamingNotSupportedError`.

## Usage

```ts
await generateSpeech({
  model: "fal-ai/fal-ai/f5-tts",
  text: "Hello!",
  voice: { url: "https://example.com/reference.wav" },
})
```

Note the double `fal-ai/` — the first is the SDK provider prefix, the rest is the fal model path.

## Voice Cloning

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
await generateSpeech({ model: fal("fal-ai/f5-tts"), text: "...", voice: { url: "..." } })
```
