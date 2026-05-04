# Speed (Time-Stretch)

Pass `speed` on `generateSpeech` or `generateConversation` to time-stretch the rendered audio without changing pitch. Range `0.75–1.5` (1 = unchanged). Outside that range throws `RangeError` synchronously.

```ts
import { generateSpeech } from "@speech-sdk/core"

const result = await generateSpeech({
  model: "provider/model",
  text: "Hello!",
  voice: "voice-id",
  speed: 1.2,        // 20% faster
})
```

## How it works

- **Direct providers** — the SDK requests a decodable wire format from the provider, decodes the audio, time-stretches in PCM, and re-encodes (preserving `output.format` if set, else mp3 by default — chosen so that callers who only set `speed` get the same container they'd get without speed).
- **Gateway** — `speed` is forwarded on the wire and the gateway server time-stretches server-side. The SDK does not reapply locally.
- **Mono only** — direct-path stretching processes mono PCM. Most TTS providers emit mono, so this is rarely a constraint.

## Timestamps and Duration

When `speed ≠ 1`, the SDK scales `start` / `end` of every word timestamp inversely (`start / speed`) so they match the post-stretch audio. `metadata.audioDurationMs` is also scaled. No caller action required.

## Conversation

`generateConversation` accepts `speed` at two levels:

```ts
await generateConversation({
  speed: 1.1, // applies to the merged audio
  turns: [
    { voice: "voice-a", text: "Slow part.", speed: 0.9 },
    { voice: "voice-b", text: "Normal part." },
  ],
})
```

Per-turn `speed` is rendered first (and forces the local-stitch path so each turn can be re-rendered independently); top-level `speed` then applies to the stitched mix. Both must fall in `0.75–1.5`.

## Streaming

`streamSpeech` does not accept `speed` — streaming can't time-stretch on the fly. Use `generateSpeech` if you need it.

## Errors

`speed` outside `0.75–1.5` throws `RangeError`; non-finite values throw `TypeError`. If the chosen direct-provider model exposes no decodable PCM/WAV mode (so the stretch step has nothing to decode), the SDK throws `OutputConversionUnsupportedError`.
