# Standardized Audio Tags

Every TTS provider handles expressive cues differently. SpeechSDK gives you one `[tag]` syntax that works everywhere — passed through natively where supported, converted to SSML where needed, stripped with warnings elsewhere.

```ts
import { generateSpeech } from "@speech-sdk/core"

const result = await generateSpeech({
  model: "elevenlabs/eleven_v3",
  text: "[laugh] Oh that is so funny! [sigh] But seriously though.",
  voice: "voice-id",
})

result.warnings // undefined — eleven_v3 supports all tags
```

## Provider Behavior

| Provider                  | Behavior                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| ElevenLabs (`eleven_v3`)  | All `[tag]` passed through                                                                                          |
| Cartesia (`sonic-3`)      | Emotion tags (`[happy]`, `[sad]`, `[angry]`, …) → SSML `<emotion>`; `[laughter]` passed through; unknown stripped   |
| Fish Audio (`s2-pro`)     | All `[tag]` passed through — S2 accepts free-form natural-language descriptions                                     |
| xAI (`grok-tts`)          | Inline tags (`[laugh]`, `[pause]`, `[long-pause]`) and wrapping tags (`<whisper>`, `<soft>`, `<slow>`) passed through |
| OpenAI (`gpt-4o-mini-tts`) | Tags mapped to the `instructions` field                                                                            |
| All others                | Tags stripped, warnings returned                                                                                    |

## Warnings

When a provider doesn't support a tag, it's stripped and a warning is returned:

```ts
const result = await generateSpeech({
  model: "openai/tts-1",
  text: "[laugh] Hello world",
  voice: "alloy",
})

result.warnings
// ["Audio tag [laugh] is not supported by openai/tts-1 and was removed."]
```

`result.warnings` is `undefined` when there are none.
