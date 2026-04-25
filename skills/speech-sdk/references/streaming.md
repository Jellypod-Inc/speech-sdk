# Streaming

Use `streamSpeech` to receive audio as it's generated. Ideal for real-time playback, voice agents, and long-form text.

## Quick Start

```ts
import { streamSpeech } from "@speech-sdk/core"

const result = await streamSpeech({
  model: "elevenlabs/eleven_v3",
  text: "Streaming audio, one chunk at a time.",
  voice: "voice-id",
})

for await (const chunk of result.audio) {
  process.stdout.write(chunk) // chunk: Uint8Array
}
```

`result.audio` is a Web `ReadableStream<Uint8Array>` — works in Node, Edge, and browser.

## StreamSpeechResult

```ts
interface StreamSpeechResult {
  readonly audio: ReadableStream<Uint8Array>
  readonly mediaType: string
  readonly metadata: SpeechMetadata                   // latencyMs, inputChars, provider, model, ...
  readonly providerMetadata?: Record<string, unknown>
  readonly warnings?: string[]
}
```

## Returning a Streaming Response

```ts
export async function GET() {
  const result = await streamSpeech({
    model: "deepgram/aura-2",
    text: "Hello from the edge.",
    voice: "thalia-en",
  })

  return new Response(result.audio, {
    headers: { "Content-Type": result.mediaType },
  })
}
```

## Playing in the Browser

Use Media Source Extensions, or buffer into a `Blob`:

```ts
const result = await streamSpeech({
  model: "cartesia/sonic-2",
  text: "Streaming in the browser.",
  voice: "voice-id",
})

const chunks: Uint8Array[] = []
for await (const chunk of result.audio) chunks.push(chunk)

const blob = new Blob(chunks, { type: result.mediaType })
new Audio(URL.createObjectURL(blob)).play()
```

## Aborting

```ts
const controller = new AbortController()
const result = await streamSpeech({
  model: "elevenlabs/eleven_v3",
  text: "...",
  voice: "voice-id",
  abortSignal: controller.signal,
})
setTimeout(() => controller.abort(), 2000)
```

## Provider Support

Not every model streams. Call `streamSpeech` directly and handle unsupported models:

```ts
import { StreamingNotSupportedError, streamSpeech } from "@speech-sdk/core"

try {
  await streamSpeech({ model: "openai/gpt-4o-mini-tts", text: "...", voice: "alloy" })
} catch (error) {
  if (error instanceof StreamingNotSupportedError) {
    // fall back to generateSpeech
  }
}
```

Calling `streamSpeech` on an unsupported model throws `StreamingNotSupportedError` — fall back to `generateSpeech`.
