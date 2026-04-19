# Speech Result

`generateSpeech` returns `SpeechResult`.

```ts
interface SpeechResult {
  readonly audio: GeneratedAudioFile
  readonly providerMetadata?: Record<string, unknown>
  readonly warnings?: string[]
}

interface GeneratedAudioFile {
  readonly uint8Array: Uint8Array   // raw audio bytes
  readonly base64: string           // base64 (lazy-computed)
  readonly mediaType: string        // e.g. "audio/mpeg"
}
```

`base64` is lazy-computed from `uint8Array` on first access — no overhead if unused.

## Writing to a File (Node)

```ts
import { writeFileSync } from "fs"

const result = await generateSpeech({ ... })
writeFileSync("output.mp3", result.audio.uint8Array)
```

## Returning a Response (Edge/Server)

```ts
return new Response(result.audio.uint8Array, {
  headers: { "Content-Type": result.audio.mediaType },
})
```

## Playing in the Browser

```ts
const blob = new Blob([result.audio.uint8Array], { type: result.audio.mediaType })
new Audio(URL.createObjectURL(blob)).play()
```

## Provider Metadata

Some providers return extras (e.g. ElevenLabs `requestId` for stitching):

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

Shape varies by provider.

## Warnings

Unsupported-feature warnings (e.g. stripped audio tags) surface here instead of throwing:

```ts
if (result.warnings) console.log(result.warnings)
```

`undefined` when there are none.
