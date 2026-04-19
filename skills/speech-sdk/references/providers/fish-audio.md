# Fish Audio

| | |
| --- | --- |
| Prefix | `fish-audio` |
| Default model | `s2-pro` |
| Env var | `FISH_AUDIO_API_KEY` |
| Official docs | https://docs.fish.audio |

## Models

| Model    | Streaming | Audio Tags | Voice Cloning | Open Source | Notes                 |
| -------- | --------- | ---------- | ------------- | ----------- | --------------------- |
| `s2-pro` | Yes       | Yes        | Yes           | Yes         | Default; multilingual |

## Usage

```ts
await generateSpeech({
  model: "fish-audio/s2-pro",
  text: "Hello!",
  voice: "reference-id-from-fish",
})
```

`voice` is sent as `reference_id`.

## Audio Tags

`s2-pro` accepts free-form bracket tags / natural-language descriptions:

```ts
await generateSpeech({
  model: "fish-audio/s2-pro",
  text: "[laugh] That's a great joke!",
  voice: "reference-id-from-fish",
})
```

## Voice Cloning

Upload a reference clip in the Fish Audio console to get a `reference_id`, or pass inline audio — see `../voice-cloning.md`.

## Provider Options

```ts
await generateSpeech({
  model: "fish-audio/s2-pro",
  text: "Hello!",
  voice: "reference-id-from-fish",
  providerOptions: {
    format: "mp3",
    mp3_bitrate: 128,
    chunk_length: 200,
    normalize: true,
  },
})
```

## Factory

```ts
import { createFishAudio } from "@speech-sdk/core/fish-audio"
const fishAudio = createFishAudio({ apiKey: process.env.FISH_AUDIO_API_KEY })
```
