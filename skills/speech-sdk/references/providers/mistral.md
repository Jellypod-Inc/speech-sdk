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
| `voxtral-mini-tts-2603` | Yes       | Yes           | Yes         | Voxtral TTS |

## Usage

Voxtral is voice-cloning first — there are no built-in named voices. Pass a reference audio clip to clone:

```ts
// clone from reference audio (base64)
await generateSpeech({
  model: "mistral/voxtral-mini-tts-2603",
  text: "Hello!",
  voice: { audio: "base64-encoded-audio..." },
})
```

A string `voice` is sent verbatim as `voice_id` if your account has a saved voice with that id, but Mistral does not publish a list of built-in voice IDs.

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
import { createMistral } from "@speech-sdk/core/providers"
const mistral = createMistral({ apiKey: process.env.MISTRAL_API_KEY })
await generateSpeech({ model: mistral(), text: "...", voice: { audio: "..." } })
```
