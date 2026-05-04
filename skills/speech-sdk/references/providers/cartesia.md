# Cartesia

| | |
| --- | --- |
| Prefix | `cartesia` |
| Default model | `sonic-3` |
| Env var | `CARTESIA_API_KEY` |
| Official docs | https://docs.cartesia.ai |

## Models

| Model     | Streaming | Audio Tags     | Voice Cloning | Native Timestamps | Notes                           |
| --------- | --------- | -------------- | ------------- | ----------------- | ------------------------------- |
| `sonic-3` | Yes       | Yes (via SSML) | Yes           | Yes               | Current flagship; emotion tags  |
| `sonic-2` | Yes       | No             | No            | Yes               | Previous generation             |

Default output is `audio/wav` at 44.1 kHz.

## Timestamps

When `timestamps: true` is set, the SDK routes through Cartesia's `/tts/sse` endpoint with `add_timestamps: true`, accumulates the interleaved `chunk` and `timestamps` events, and returns the merged audio + word alignment.

```ts
const result = await generateSpeech({
  model: "cartesia/sonic-3",
  text: "Hello, world!",
  voice: "a0e99841-438c-4a64-b679-ae501e7d6091",
  timestamps: true,
})
result.timestamps // [{ text: "Hello,", start: 0, end: 0.42 }, ...]
```

The SSE path requests `output_format: { container: "raw", encoding: "pcm_s16le", sample_rate: 24_000 }` so audio chunks can be concatenated without per-chunk WAV-header arithmetic. The SDK wraps the concatenated PCM in a single RIFF/WAVE header before returning — the result is a standard `audio/wav` file at 24 kHz mono s16le. The audio-only `/tts/bytes` path (when `timestamps` is omitted or `false`) preserves the previous WAV defaults unchanged.

## Usage

```ts
await generateSpeech({
  model: "cartesia/sonic-3",
  text: "Hello!",
  voice: "a0e99841-438c-4a64-b679-ae501e7d6091",
})
```

## Audio Tags

`sonic-3`:
- Emotion tags (`[happy]`, `[sad]`, `[angry]`, `[excited]`, …) → Cartesia SSML `<emotion>`
- `[laughter]` passed through
- Unknown tags stripped with warning

## Voice Cloning

`sonic-3` supports inline cloning via `voice: { audio: ... }`.

## Provider Options

```ts
await generateSpeech({
  model: "cartesia/sonic-3",
  text: "Hello!",
  voice: "...",
  providerOptions: {
    language: "en",
    output_format: { container: "wav", encoding: "pcm_s16le", sample_rate: 44_100 },
    speed: "normal",
  },
})
```

## Factory

```ts
import { createCartesia } from "@speech-sdk/core/providers"
const cartesia = createCartesia({ apiKey: process.env.CARTESIA_API_KEY })
```
