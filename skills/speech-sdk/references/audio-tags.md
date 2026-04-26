# Standardized Audio Tags

Every TTS provider handles expressive cues differently. SpeechSDK gives you one `[tag]` syntax — passed through natively where supported, converted to SSML where needed, stripped with warnings elsewhere.

```ts
import { generateSpeech } from "@speech-sdk/core"

const result = await generateSpeech({
  model: "provider/model",
  text: "[laugh] Oh that is so funny! [sigh] But seriously though.",
  voice: "voice-id",
})
```

Tag support is per-model. See `providers/<name>.md` for which models within a provider honor `[tag]` syntax and how they map (passthrough, SSML, instructions, or stripped).

## Warnings

When a provider doesn't support a tag, it's stripped and a warning is returned:

```ts
const result = await generateSpeech({
  model: "provider/model",
  text: "[laugh] Hello world",
  voice: "voice-id",
})

result.warnings
// ["Audio tag [laugh] is not supported by provider/model and was removed."]
```

`result.warnings` is `undefined` when there are none.
