# Auto-Chunking (Long Text)

When the input text exceeds the model's `maxInputChars`, the SDK splits it on sentence/paragraph boundaries, generates each chunk in parallel, decodes each one to PCM, and stitches them back together. Direct-provider path only.

```ts
import { generateSpeech } from "@speech-sdk/core"

const result = await generateSpeech({
  model: "elevenlabs/eleven_flash_v2_5",
  text: longText,         // any length
  voice: "voice-id",
  maxConcurrency: 4,      // optional; default 6
})
```

No special flag — chunking activates automatically when `text.length` exceeds the model's threshold.

## Threshold

Each model declares its own `maxInputChars` in its `models[]` entry (e.g. `gpt-4o-mini-tts: 4096`, `eleven_flash_v2_5: 40000`, `aura-2: 2000`). Models without a declared threshold are sent as-is and the provider rejects oversized input.

Override per call:

```ts
await generateSpeech({
  model: "...",
  text: longText,
  voice: "...",
  maxInputChars: 1500,    // smaller chunks
})
```

If the user-supplied `maxInputChars` exceeds the provider's declared limit, the SDK still uses the user value but logs a debug message — the provider may reject oversized chunks.

## Splitting

The chunker prefers (in order) paragraph breaks (`\n\n`), line breaks (`\n`), sentence boundaries (`. ! ?` etc.), then whitespace. It targets even-length chunks while staying under `maxInputChars` on each. Surrogate pairs are preserved.

## Concurrency

Chunks are issued in parallel up to `maxConcurrency` (default 6). Lower it to 1 to serialize when the provider's account-level concurrency is the bottleneck:

```ts
await generateSpeech({
  model: "...",
  text: longText,
  voice: "...",
  maxConcurrency: 1,
})
```

Errors from any chunk abort sibling requests via `AbortController` so in-flight calls cancel instead of running to completion with discarded results.

## Stitching

Each chunk is decoded to 16-bit PCM (mono, 24 kHz target sample rate) and concatenated without inter-chunk silence. The final result is wrapped as a single `audio/wav` file. Native timestamps from each chunk are stitched with cumulative offsets when every chunk returned alignment; otherwise the timestamps field is omitted (mixed availability isn't surfaced).

If `output: { format }` was requested, conversion to the final container happens after stitching.

## Provider Capability

Chunking requires the provider/model to expose decodable PCM/WAV (so the SDK can decode each chunk before stitching). Models that only emit opaque compressed audio throw `TextChunkingUnsupportedError` when input exceeds `maxInputChars`.

## Gateway

The gateway path ignores `maxInputChars` and `maxConcurrency` — the gateway server owns request processing and does its own chunking server-side. Passing them with a `provider/model` string is a no-op (debug-logged).

## Streaming

`streamSpeech` does not chunk; the request goes out as a single call. Use `generateSpeech` if you need auto-chunking.

## Errors

| Error                          | When                                                               |
| ------------------------------ | ------------------------------------------------------------------ |
| `TextChunkingUnsupportedError` | Input exceeds `maxInputChars` but the model can't expose decodable PCM/WAV |
