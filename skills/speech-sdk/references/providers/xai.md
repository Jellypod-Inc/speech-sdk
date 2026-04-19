# xAI (Grok)

| | |
| --- | --- |
| Prefix | `xai` |
| Default model | `grok-tts` |
| Env var | `XAI_API_KEY` |
| Official docs | https://docs.x.ai |

## Models

| Model      | Streaming | Audio Tags        | Voice Cloning | Notes                               |
| ---------- | --------- | ----------------- | ------------- | ----------------------------------- |
| `grok-tts` | Yes       | Yes (passthrough) | No            | Native bracket and `<whisper>` tags |

Languages (`language`): `en`, `ar-EG`, `ar-SA`, `ar-AE`, `bn`, `zh`, `fr`, `de`, `hi`, `id`, `it`, `ja`, `ko`, `pt-BR`, `pt-PT`, `ru`, `es-MX`, `es-ES`, `tr`, `vi`. Default is `auto`.

## Usage

```ts
await generateSpeech({
  model: "xai/grok-tts",
  text: "Hello!",
  voice: "ava",
})
```

`voice` is sent as `voice_id`.

## Audio Tags

Both styles pass through unchanged:

- Inline: `[pause]`, `[laugh]`, `[sigh]`
- Wrapping: `<whisper>quiet part</whisper>`, `<soft>`, `<slow>`

```ts
await generateSpeech({
  model: "xai/grok-tts",
  text: "[laugh] Oh that's great. <whisper>Don't tell anyone.</whisper>",
  voice: "ava",
})
```

## Provider Options

```ts
await generateSpeech({
  model: "xai/grok-tts",
  text: "Hello!",
  voice: "ava",
  providerOptions: {
    language: "en",                        // BCP-47, or "auto"
    output_format: { codec: "wav" },       // mp3 (default) | wav | pcm | mulaw | alaw
  },
})
```

`language` is required by the xAI API — SpeechSDK defaults to `"auto"`.

## Factory

```ts
import { createXai } from "@speech-sdk/core/xai"
const xai = createXai({ apiKey: process.env.XAI_API_KEY, baseURL: "https://api.x.ai/v1" })
```
