# Gradium

Direct factory: `createGradium({ apiKey?, baseURL?, fetch?, fallbackSTT? })`

Env var: `GRADIUM_API_KEY`

Default base URL: `https://api.gradium.ai/api`

Default model: `default`

## Models

| Model | Notes |
| --- | --- |
| `default` | Gradium's default TTS model. |

## Voices

Pass a Gradium `voice_id` as `voice`.

```ts
import { generateSpeech } from "@speech-sdk/core"
import { createGradium } from "@speech-sdk/core/providers"

await generateSpeech({
  model: createGradium()(),
  text: "Your morning briefing is ready. Revenue is up, support volume is steady, and the launch checklist is on track.",
  voice: "cLONiZ4hQ8VpQ4Sz",
})
```

## Provider Options

`providerOptions` pass through to Gradium's TTS POST body using native field names. Common fields:

```ts
await generateSpeech({
  model: createGradium()(),
  text: "Say ACME as ack-mee, then pause before the customer update.",
  voice: "cLONiZ4hQ8VpQ4Sz",
  providerOptions: {
    pronunciation_id: "pronunciation-id",
    json_config: { speed: 1.05 },
  },
})
```

The SDK always sends `only_audio: true` so Gradium returns raw audio bytes.

## Output

Default output is WAV. `output: { format: "wav" | "pcm" | "mp3", sampleRate? }` is supported. Gradium natively returns WAV or PCM; MP3 is encoded locally from PCM. Supported PCM sample rates: `8000`, `16000`, `22050`, `24000`, `44100`, `48000`.

```ts
await generateSpeech({
  model: createGradium()(),
  text: "Export this line as clean PCM for a low-latency voice agent.",
  voice: "cLONiZ4hQ8VpQ4Sz",
  output: { format: "pcm", sampleRate: 24_000 },
})
```
