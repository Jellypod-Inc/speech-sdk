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

| Provider   | Behavior                                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------------------------- |
| ElevenLabs | All `[tag]` passed through                                                                                            |
| Cartesia   | Emotion tags (`[happy]`, `[sad]`, `[angry]`, …) → SSML `<emotion>`; `[laughter]` passed through; unknown stripped     |
| Fish Audio | All `[tag]` passed through — accepts free-form natural-language descriptions                                          |
| xAI        | Inline tags (`[laugh]`, `[pause]`, `[long-pause]`) and wrapping tags (`<whisper>`, `<soft>`, `<slow>`) passed through |
| OpenAI     | Tags mapped to the `instructions` field                                                                               |
| All others | Tags stripped, warnings returned                                                                                      |

Tag support is per-model — see `providers/<name>.md` for which models within a provider honor `[tag]` syntax.

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
