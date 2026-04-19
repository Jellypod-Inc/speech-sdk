# Resemble

| | |
| --- | --- |
| Prefix | `resemble` |
| Default model | `default` |
| Env var | `RESEMBLE_API_KEY` |
| Official docs | https://docs.resemble.ai |

## Models

| Model     | Streaming | Audio Tags | Voice Cloning | Open Source | Notes              |
| --------- | --------- | ---------- | ------------- | ----------- | ------------------ |
| `default` | Yes       | No         | Yes           | Yes         | Single model entry |

## Usage

```ts
await generateSpeech({
  model: "resemble/default",
  text: "Hello!",
  voice: "voice-uuid-from-resemble",
})
```

`voice` is sent as `voice_uuid`.

## Voice Cloning

Create a clone in the Resemble dashboard, pass its UUID as `voice`.

## Provider Options

```ts
await generateSpeech({
  model: "resemble/default",
  text: "Hello!",
  voice: "voice-uuid-from-resemble",
  providerOptions: {
    output_format: "mp3",
    sample_rate: 44_100,
    precision: "PCM_16",
  },
})
```

## Factory

```ts
import { createResemble } from "@speech-sdk/core/resemble"
const resemble = createResemble({ apiKey: process.env.RESEMBLE_API_KEY })
```
