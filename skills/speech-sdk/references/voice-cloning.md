# Voice Cloning

Some providers support inline voice cloning — pass a voice object with reference audio instead of a voice ID string. No voice is saved; it just mimics the reference for that generation.

## From Base64 Audio

```ts
import { generateSpeech } from "@speech-sdk/core"
import { createMistral } from "@speech-sdk/core/mistral"

const mistral = createMistral()

await generateSpeech({
  model: mistral(),
  text: "Hello in a cloned voice!",
  voice: { audio: "base64-encoded-audio..." },
})
```

Also accepts `Uint8Array` (assumes the same `mistral` factory from the snippet above):

```ts
import { readFileSync } from "fs"
import { generateSpeech } from "@speech-sdk/core"
import { createMistral } from "@speech-sdk/core/mistral"

const mistral = createMistral()

await generateSpeech({
  model: mistral(),
  text: "Hello!",
  voice: { audio: readFileSync("./reference.wav") },
})
```

## From a URL

```ts
import { createFal } from "@speech-sdk/core/fal-ai"

const fal = createFal()

await generateSpeech({
  model: fal("fal-ai/chatterbox"),
  text: "Hello!",
  voice: { url: "https://example.com/reference.wav" },
})
```

## Voice Type

```ts
type Voice =
  | string                            // voice ID
  | { audio: string | Uint8Array }    // inline clone from audio data
  | { url: string }                   // inline clone from URL
```

## Providers with Voice Cloning

| Provider             | Cloning | Method     |
| -------------------- | ------- | ---------- |
| Cartesia (`sonic-3`) | Yes     | Audio data |
| Mistral              | Yes     | Audio data |
| fal (select models)  | Yes     | URL / data |
| Hume (`octave-2`)    | Yes     | Named voice from Hume account |
| Resemble             | Yes     | `voice_uuid` (created in Resemble dashboard) |
| Fish Audio           | Yes     | `reference_id` or inline |

Not every model within a provider supports cloning — check `providers/<name>.md`.
