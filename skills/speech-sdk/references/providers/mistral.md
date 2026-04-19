# Mistral (Voxtral TTS)

| | |
| --- | --- |
| Prefix | `mistral` |
| Default model | `voxtral-mini-tts-2603` |
| Env var | `MISTRAL_API_KEY` |
| Official docs | https://docs.mistral.ai/capabilities/audio/text_to_speech/speech |

## Models

| Model                   | Streaming | Voice Cloning | Open Source | Notes       |
| ----------------------- | --------- | ------------- | ----------- | ----------- |
| `voxtral-mini-tts-2603` | No        | Yes           | Yes         | Voxtral TTS |

## Usage

Voxtral is voice-cloning first — no built-in voice IDs. Every request passes reference audio:

```ts
await generateSpeech({
  model: "mistral/voxtral-mini-tts-2603",
  text: "Hello!",
  voice: { audio: "base64-encoded-audio..." },
})
```

Also accepts `Uint8Array`:

```ts
import { readFileSync } from "fs"

await generateSpeech({
  model: "mistral/voxtral-mini-tts-2603",
  text: "Hello!",
  voice: { audio: readFileSync("./reference.wav") },
})
```

## Provider Options

```ts
providerOptions: {
  response_format: "mp3", // mp3 | opus | wav
}
```

## Factory

```ts
import { createMistral } from "@speech-sdk/core/mistral"
const mistral = createMistral({ apiKey: process.env.MISTRAL_API_KEY })
await generateSpeech({ model: mistral(), text: "...", voice: { audio: "..." } })
```
