# Streaming

Use `streamSpeech` to receive audio as it's generated. Ideal for real-time playback, voice agents, and long-form text.

## Quick Start

```ts
import { streamSpeech } from "@speech-sdk/core"

const result = await streamSpeech({
  model: "provider/model",
  text: "Streaming audio, one chunk at a time.",
  voice: "voice-id",
})

for await (const chunk of result.audio) {
  process.stdout.write(chunk) // chunk: Uint8Array
}
```

`result.audio` is a Web `ReadableStream<Uint8Array>` — works in Node, Edge, and browser. The result also exposes `mediaType`, `metadata`, and optional `providerMetadata` / `warnings`. Import `StreamSpeechResult` from `@speech-sdk/core` when you need the exact shape.

## Returning a Streaming Response

```ts
export async function GET() {
  const result = await streamSpeech({
    model: "provider/model",
    text: "Hello from the edge.",
    voice: "voice-id",
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
  model: "provider/model",
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
  model: "provider/model",
  text: "...",
  voice: "voice-id",
  abortSignal: controller.signal,
})
setTimeout(() => controller.abort(), 2000)
```

## Unsupported Models

Not every model streams. Calling `streamSpeech` on an unsupported model throws `StreamingNotSupportedError` — fall back to `generateSpeech`:

```ts
import { StreamingNotSupportedError, streamSpeech } from "@speech-sdk/core"

try {
  await streamSpeech({ model: "provider/model", text: "...", voice: "voice-id" })
} catch (error) {
  if (error instanceof StreamingNotSupportedError) {
    // fall back to generateSpeech
  }
}
```

See `providers/<name>.md` for which models within a provider support streaming.
