# Cartesia

| | |
| --- | --- |
| Prefix | `cartesia` |
| Default model | `sonic-3` |
| Env var | `CARTESIA_API_KEY` |
| Official docs | https://docs.cartesia.ai |

## Models

| Model     | Streaming | Audio Tags     | Voice Cloning | Notes                           |
| --------- | --------- | -------------- | ------------- | ------------------------------- |
| `sonic-3` | Yes       | Yes (via SSML) | Yes           | Current flagship; emotion tags  |
| `sonic-2` | Yes       | No             | No            | Previous generation             |

Default output is `audio/wav` at 44.1 kHz.

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
import { createCartesia } from "@speech-sdk/core/cartesia"
const cartesia = createCartesia({ apiKey: process.env.CARTESIA_API_KEY })
```
