# Voice Cloning

Some providers support inline voice cloning — pass a voice object with reference audio instead of a voice ID string. No voice is saved; it just mimics the reference for that generation.

The `voice` field accepts:

- a string (provider voice ID),
- `{ audio }` — base64 string or `Uint8Array` of reference audio,
- `{ url }` — URL to a reference audio file the provider can fetch.

## From Base64 / Bytes

```ts
import { generateSpeech } from "@speech-sdk/core"

await generateSpeech({
  model: "provider/model",
  text: "Hello in a cloned voice!",
  voice: { audio: "base64-encoded-audio..." },
})
```

```ts
import { readFileSync } from "fs"

await generateSpeech({
  model: "provider/model",
  text: "Hello!",
  voice: { audio: readFileSync("./reference.wav") },
})
```

## From a URL

```ts
await generateSpeech({
  model: "provider/model",
  text: "Hello!",
  voice: { url: "https://example.com/reference.wav" },
})
```

Cloning is per-model. Not every provider supports it, and within providers that do, not every model accepts every voice form. See `providers/<name>.md` for which models accept which forms.
