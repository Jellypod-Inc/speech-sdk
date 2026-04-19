# Google (Gemini TTS)

| | |
| --- | --- |
| Prefix | `google` |
| Default model | `gemini-2.5-flash-preview-tts` |
| Env var | `GOOGLE_API_KEY` |
| Official docs | https://ai.google.dev/gemini-api/docs/text-generation |

## Models

| Model                          | Streaming | Audio Tags | Voice Cloning | Notes                  |
| ------------------------------ | --------- | ---------- | ------------- | ---------------------- |
| `gemini-2.5-flash-preview-tts` | Yes       | No         | No            | Default; lower latency |
| `gemini-2.5-pro-preview-tts`   | Yes       | No         | No            | Higher quality         |

## Usage

```ts
await generateSpeech({
  model: "google/gemini-2.5-flash-preview-tts",
  text: "Hello!",
  voice: "Kore",
})
```

Built-in voices include `Kore`, `Puck`, `Charon`, `Fenrir`, `Aoede` — see Gemini TTS docs for the full list.

## Output Format

Gemini returns raw PCM. `mediaType` is `audio/L16;rate=24000`, bytes are passed through unchanged. Wrap in WAV yourself if you need a container.

## Streaming

Gemini's streaming is server-buffered SSE — chunks may arrive in larger batches than with true chunked providers.

## Provider Options

```ts
await generateSpeech({
  model: "google/gemini-2.5-flash-preview-tts",
  text: "Hello!",
  voice: "Kore",
  providerOptions: { temperature: 0.9 },
})
```

## Factory

```ts
import { createGoogle } from "@speech-sdk/core/google"
const google = createGoogle({ apiKey: process.env.GOOGLE_API_KEY })
```
