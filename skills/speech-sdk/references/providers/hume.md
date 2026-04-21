# Hume

| | |
| --- | --- |
| Prefix | `hume` |
| Default model | `octave-2` |
| Env var | `HUME_API_KEY` |
| Official docs | https://dev.hume.ai/docs/text-to-speech-tts/overview |

## Models

| Model      | Streaming | Audio Tags | Voice Cloning | Native Timestamps | Notes               |
| ---------- | --------- | ---------- | ------------- | ----------------- | ------------------- |
| `octave-2` | Yes       | No         | Yes           | Yes               | Default; expressive |
| `octave-1` | Yes       | No         | No            | No                | Previous generation |

## Timestamps

`octave-2` returns word alignment natively. When `timestamps: "auto"` or `"on"` is set, the SDK routes through Hume's JSON `/v0/tts` endpoint with `include_timestamp_types: ["word"]` and `split_utterances: false`, then flattens the snippet timestamps to the SDK's seconds-based `WordTimestamp[]`.

```ts
const result = await generateSpeech({
  model: "hume/octave-2",
  text: "Hello, world!",
  voice: "Kora",
  timestamps: "auto",
})
result.timestamps // [{ text: "Hello,", start: 0, end: 0.42 }, ...]
```

`octave-1` is bytes-only — `timestamps: "on"` falls back to the default Whisper STT pass.

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
