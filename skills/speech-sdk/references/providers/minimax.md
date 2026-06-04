# MiniMax

| | |
| --- | --- |
| Prefix | `minimax` |
| Default model | `speech-2.6-hd` |
| Env var | `MINIMAX_API_KEY` |
| Official docs | https://platform.minimax.io/docs/api-reference/speech-t2a-http |

## Models

| Model              | Streaming | Audio Tags | Voice Cloning | Native Timestamps | Notes                          |
| ------------------ | --------- | ---------- | ------------- | ----------------- | ------------------------------ |
| `speech-2.6-hd`    | No        | No         | No            | No                | Current flagship, high fidelity |
| `speech-2.6-turbo` | No        | No         | No            | No                | Low-latency 2.6                 |
| `speech-02-hd`     | No        | No         | No            | No                | High fidelity                   |
| `speech-02-turbo`  | No        | No         | No            | No                | Low-latency 02                  |
| `speech-01-hd`     | No        | No         | No            | No                | Previous generation             |
| `speech-01-turbo`  | No        | No         | No            | No                | Previous generation, low latency |

Streaming is not exposed — `streamSpeech` throws `StreamingNotSupportedError`. `timestamps: true` on a direct factory falls back to the default Whisper STT pass.

MiniMax returns hex-encoded audio in a JSON envelope; the SDK decodes it to raw bytes. Logical errors are tunneled through `base_resp.status_code` (HTTP stays 200) and surfaced as `ApiError` — rate limits (`1002`) are retried.

## Usage

```ts
await generateSpeech({
  model: "minimax/speech-2.6-hd",
  text: "Hello!",
  voice: "Wise_Woman",
})
```

The default voice (when `voice` is omitted) is `Wise_Woman`. MiniMax ships 300+ system voices (e.g. `Friendly_Person`, `Calm_Woman`, `Deep_Voice_Man`) — see the official voice list.

## Provider Options

`providerOptions` mirror the T2A v2 request body and are forwarded untransformed. `voice_setting.voice_id` is overridden by the SDK's `voice` argument; `audio_setting` is overridden when an `output` format is requested.

```ts
await generateSpeech({
  model: "minimax/speech-2.6-hd",
  text: "Hello!",
  voice: "Wise_Woman",
  providerOptions: {
    voice_setting: { speed: 1, vol: 1, pitch: 0, emotion: "happy" },
    audio_setting: { format: "mp3", sample_rate: 32_000, bitrate: 128_000, channel: 1 },
    language_boost: "English",
  },
})
```

## Output Formats

`output: { format: "wav" | "pcm" | "mp3" }` is supported. Supported sample rates: `8000`, `16000`, `22050`, `24000`, `32000`, `44100` (the SDK defaults to the highest). For `wav`/`pcm` the SDK requests raw `pcm` from MiniMax and wraps/forwards it; for `mp3` it requests MiniMax MP3 at the nearest supported bitrate.

## Group ID

Some MiniMax endpoints (notably mainland China, `api.minimaxi.chat`) require a Group ID. Pass it via the factory `groupId` option or the `MINIMAX_GROUP_ID` env var; it is appended as a `GroupId` query parameter. The default international endpoint (`api.minimax.io`) authenticates with the API key alone.

## Factory

```ts
import { createMiniMax } from "@speech-sdk/core/providers"
const minimax = createMiniMax({ apiKey: process.env.MINIMAX_API_KEY })
await generateSpeech({ model: minimax("speech-2.6-hd"), text: "...", voice: "Wise_Woman" })
```
