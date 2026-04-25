# Resemble

| | |
| --- | --- |
| Prefix | `resemble` |
| Default model | `default` |
| Env var | `RESEMBLE_API_KEY` |
| Official docs | https://docs.resemble.ai |

## Models

| Model     | Streaming | Audio Tags | Voice Cloning | Native Timestamps | Open Source | Notes              |
| --------- | --------- | ---------- | ------------- | ----------------- | ----------- | ------------------ |
| `default` | Yes       | No         | Yes           | Yes               | Yes         | Single model entry |

## Timestamps

`/synthesize` always returns `audio_timestamps` (no opt-in flag), so when `timestamps: "on"` or `"on"` is set, the SDK aggregates Resemble's grapheme-level alignment (`graph_chars[]` + `graph_times[][start, end]`, in seconds) into the SDK's word list. Mirrors the ElevenLabs aggregator: split on whitespace, keep punctuation attached to the adjacent word.

```ts
const result = await generateSpeech({
  model: "resemble/default",
  text: "Hello, world!",
  voice: "voice-uuid-from-resemble",
  timestamps: "on",
})
result.timestamps // [{ text: "Hello,", start: 0, end: 0.32 }, ...]
```

The streaming `/stream` endpoint is bytes-only — `timestamps: "on"` on a streamed call falls back to the default Whisper STT pass.

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
import { createResemble } from "@speech-sdk/core/providers"
const resemble = createResemble({ apiKey: process.env.RESEMBLE_API_KEY })
```
