# OpenAI

| | |
| --- | --- |
| Prefix | `openai` |
| Default model | `gpt-4o-mini-tts` |
| Env var | `OPENAI_API_KEY` |
| Official docs | https://platform.openai.com/docs/guides/text-to-speech |

## Models

| Model             | Streaming | Audio Tags               | Voice Cloning | Notes                               |
| ----------------- | --------- | ------------------------ | ------------- | ----------------------------------- |
| `gpt-4o-mini-tts` | Yes       | Yes (via `instructions`) | No            | Steerable; tags become instructions |
| `tts-1`           | Yes       | No                       | No            | Low-latency, fixed voices           |
| `tts-1-hd`        | Yes       | No                       | No            | Higher quality, fixed voices        |

## Usage

```ts
await generateSpeech({
  model: "openai/gpt-4o-mini-tts",
  text: "Hello!",
  voice: "alloy",
})
```

Built-in voices: `alloy`, `ash`, `ballad`, `coral`, `echo`, `fable`, `onyx`, `nova`, `sage`, `shimmer`, `verse`.

## Audio Tags

`gpt-4o-mini-tts` is steerable — standardized tags map to the OpenAI `instructions` field:

```ts
await generateSpeech({
  model: "openai/gpt-4o-mini-tts",
  text: "[cheerful] Welcome back!",
  voice: "alloy",
})
```

`tts-1` / `tts-1-hd` strip tags and return a warning.

## Provider Options

```ts
await generateSpeech({
  model: "openai/gpt-4o-mini-tts",
  text: "Hello!",
  voice: "alloy",
  providerOptions: {
    speed: 1.2,                      // 0.25–4.0
    response_format: "opus",         // mp3 | opus | aac | flac | wav | pcm
    instructions: "Warm, friendly.", // gpt-4o-mini-tts only
  },
})
```

## Factory

```ts
import { createOpenAI } from "@speech-sdk/core/providers"

const openai = createOpenAI({ apiKey: "sk-...", baseURL: "https://my-proxy.com/v1" })
await generateSpeech({ model: openai("gpt-4o-mini-tts"), text: "...", voice: "alloy" })
```
