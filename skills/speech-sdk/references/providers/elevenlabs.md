# ElevenLabs

| | |
| --- | --- |
| Prefix | `elevenlabs` |
| Default model | `eleven_multilingual_v2` |
| Env var | `ELEVENLABS_API_KEY` |
| Official docs | https://elevenlabs.io/docs |

## Models

| Model                    | Streaming | Audio Tags        | Notes                                      |
| ------------------------ | --------- | ----------------- | ------------------------------------------ |
| `eleven_v3`              | Yes       | Yes (passthrough) | Most expressive; all bracket tags          |
| `eleven_multilingual_v2` | Yes       | No                | Default; stable multilingual               |
| `eleven_flash_v2_5`      | Yes       | No                | Low-latency, multilingual                  |
| `eleven_flash_v2`        | Yes       | No                | Low-latency, English                       |

## Usage

```ts
await generateSpeech({
  model: "elevenlabs/eleven_multilingual_v2",
  text: "Hello!",
  voice: "EXAVITQu4vr4xnSDxMaL",
})
```

`voice` is an ElevenLabs voice ID.

## Audio Tags

`eleven_v3` passes `[tag]` straight through:

```ts
await generateSpeech({
  model: "elevenlabs/eleven_v3",
  text: "[laugh] That's hilarious! [sigh] But really though.",
  voice: "EXAVITQu4vr4xnSDxMaL",
})
```

Other models strip tags and return warnings.

## Provider Options

Body params spread into the JSON body. `output_format`, `enable_logging`, and `optimize_streaming_latency` are extracted and sent as URL query params.

```ts
await generateSpeech({
  model: "elevenlabs/eleven_multilingual_v2",
  text: "Hello!",
  voice: "EXAVITQu4vr4xnSDxMaL",
  providerOptions: {
    // Body
    voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true },
    language_code: "en",
    previous_request_ids: ["req-abc"],
    next_request_ids: ["req-def"],
    previous_text: "Previous paragraph...",
    next_text: "Next paragraph...",
    seed: 42,
    apply_text_normalization: "auto", // auto | on | off

    // Query
    output_format: "mp3_44100_192",
    enable_logging: false,
    optimize_streaming_latency: 2,
  },
})
```

## Request Stitching

```ts
const first = await generateSpeech({ model: "elevenlabs/eleven_multilingual_v2", ... })

const second = await generateSpeech({
  model: "elevenlabs/eleven_multilingual_v2",
  text: "Second paragraph...",
  voice: "voice-id",
  providerOptions: {
    previous_request_ids: [first.providerMetadata?.requestId],
  },
})
```

## Factory

```ts
import { createElevenLabs } from "@speech-sdk/core/providers"
const elevenlabs = createElevenLabs({ apiKey: process.env.ELEVENLABS_API_KEY })
await generateSpeech({ model: elevenlabs("eleven_v3"), text: "...", voice: "..." })
```
