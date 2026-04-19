# Inworld

| | |
| --- | --- |
| Prefix | `inworld` |
| Default model | `inworld-tts-1.5-max` |
| Env var | `INWORLD_API_KEY` |
| Official docs | https://docs.inworld.ai |

## Models

| Model                   | Streaming | Audio Tags | Voice Cloning | Notes                                               |
| ----------------------- | --------- | ---------- | ------------- | --------------------------------------------------- |
| `inworld-tts-1.5-max`   | Yes       | No         | No            | Flagship; best quality/speed balance                |
| `inworld-tts-1.5-mini`  | Yes       | No         | No            | Ultra-fast, cost-efficient                          |

Both support 11 languages: `en`, `es`, `fr`, `de`, `it`, `pt`, `ja`, `ko`, `nl`, `pl`, `zh`.

## Usage

```ts
await generateSpeech({
  model: "inworld/inworld-tts-1.5-max",
  text: "Hello!",
  voice: "Ashley",
})
```

Built-in voices include `Ashley`, `Dominus`, `Edward`, `Hades`, `Priya`.

## Provider Options

```ts
await generateSpeech({
  model: "inworld/inworld-tts-1.5-max",
  text: "Hello!",
  voice: "Ashley",
  providerOptions: { temperature: 0.8, language: "en" },
})
```

## Factory

```ts
import { createInworld } from "@speech-sdk/core/inworld"
const inworld = createInworld({ apiKey: process.env.INWORLD_API_KEY })
```
