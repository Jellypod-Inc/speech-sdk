# Speech Result

`generateSpeech` returns `SpeechResult`.

```ts
interface SpeechResult {
  readonly audio: GeneratedAudioFile
  readonly metadata: SpeechMetadata
  readonly timestamps?: readonly WordTimestamp[]   // populated when requested
  readonly providerMetadata?: Record<string, unknown>
  readonly warnings?: string[]
}

interface GeneratedAudioFile {
  readonly uint8Array: Uint8Array   // raw audio bytes
  readonly base64: string           // base64 (lazy-computed)
  readonly mediaType: string        // e.g. "audio/mpeg"
}

interface WordTimestamp {
  readonly text: string
  readonly start: number            // seconds from start of audio
  readonly end: number              // seconds
}
```

`timestamps` is populated from the provider or Speech Gateway response. Gateway-routed `timestamps: "on"` never runs client-side STT fallback; if the gateway response lacks timestamps, the SDK throws `GatewayTimestampsUnavailableError`. See `timestamps.md`.

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

Some providers return extras (e.g. ElevenLabs `requestId` for stitching). Speech Gateway only returns `providerMetadata` when the gateway JSON body includes it; the SDK does not derive provider metadata from response headers.

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
