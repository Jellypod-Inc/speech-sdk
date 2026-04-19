# Hume

| | |
| --- | --- |
| Prefix | `hume` |
| Default model | `octave-2` |
| Env var | `HUME_API_KEY` |
| Official docs | https://dev.hume.ai/docs/text-to-speech-tts/overview |

## Models

| Model      | Streaming | Audio Tags | Voice Cloning | Notes               |
| ---------- | --------- | ---------- | ------------- | ------------------- |
| `octave-2` | Yes       | No         | Yes           | Default; expressive |
| `octave-1` | Yes       | No         | No            | Previous generation |

## Usage

```ts
await generateSpeech({
  model: "hume/octave-2",
  text: "Hello!",
  voice: "Dacher",
})
```

SpeechSDK wraps the `voice` string as `{ name: "Dacher", provider: "HUME_AI" }` for the Hume API.

## Voice Cloning

`octave-2` supports cloning — pass the voice name of a voice saved in your Hume account.

## Provider Options

```ts
await generateSpeech({
  model: "hume/octave-2",
  text: "Hello!",
  voice: "Dacher",
  providerOptions: {
    description: "Warm, friendly tone, speaking softly.",
    format: { type: "mp3" },
  },
})
```

`description` is Hume's native steering input.

## Factory

```ts
import { createHume } from "@speech-sdk/core/hume"
const hume = createHume({ apiKey: process.env.HUME_API_KEY })
```
