# Inworld

| | |
| --- | --- |
| Prefix | `inworld` |
| Default model | `inworld-tts-1.5-max` |
| Env var | `INWORLD_API_KEY` |
| Official docs | https://docs.inworld.ai |

## Models

| Model                   | Streaming | Audio Tags | Voice Cloning | Native Timestamps | Notes                                               |
| ----------------------- | --------- | ---------- | ------------- | ----------------- | --------------------------------------------------- |
| `inworld-tts-1.5-max`   | Yes       | No         | No            | Yes               | Flagship; best quality/speed balance                |
| `inworld-tts-1.5-mini`  | Yes       | No         | No            | Yes               | Ultra-fast, cost-efficient                          |

Both support 11 languages: `en`, `es`, `fr`, `de`, `it`, `pt`, `ja`, `ko`, `nl`, `pl`, `zh`.

## Timestamps

Both Inworld models return word alignment natively. The SDK adds `timestamp_type: "WORD"` to the request when `timestamps: "on"` is set, then projects `timestampInfo.wordAlignment.{words, wordStartTimeSeconds, wordEndTimeSeconds}` into the SDK's seconds-based `WordTimestamp[]` (no unit conversion needed — Inworld already emits seconds).

```ts
const result = await generateSpeech({
  model: "inworld/inworld-tts-1.5-max",
  text: "Hello, world!",
  voice: "Ashley",
  timestamps: "on",
})
result.timestamps // [{ text: "Hello,", start: 0, end: 0.28 }, ...]
```

Inworld officially supports word alignment for English and Spanish; other languages may return less reliable timing (treated as experimental upstream).

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
import { createInworld } from "@speech-sdk/core/providers"
const inworld = createInworld({ apiKey: process.env.INWORLD_API_KEY })
```
