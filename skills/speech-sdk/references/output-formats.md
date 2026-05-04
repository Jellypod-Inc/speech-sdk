# Output Formats

Pass `output: { format, bitrate? }` on `generateSpeech` / `generateConversation` to pick the audio container. Providers that can produce the format natively do so; otherwise the SDK decodes via mediabunny and re-encodes.

```ts
import { generateSpeech } from "@speech-sdk/core"

const result = await generateSpeech({
  model: "provider/model",
  text: "Hello!",
  voice: "voice-id",
  output: { format: "mp3", bitrate: 128 },
})

result.audio.mediaType // "audio/mpeg"
```

## Shape

```ts
output:
  | { format: "wav" }
  | { format: "pcm" }
  | { format: "mp3"; bitrate?: number }   // kbps; default 96
```

`bitrate` is only valid for `mp3`. Passing `bitrate` with `format: "wav"` or `format: "pcm"` throws `AudioOutputInputError`.

## Resolved mediaType

| `output.format` | `result.audio.mediaType`         |
| --------------- | -------------------------------- |
| `"wav"`         | `audio/wav`                      |
| `"mp3"`         | `audio/mpeg`                     |
| `"pcm"`         | `audio/pcm;rate=<sample-rate>`   |

PCM keeps whatever sample rate the provider emitted (typically 24 kHz for chunked/stitched paths).

## Native vs Local Conversion

For each direct-provider call, the SDK first asks the provider whether it can emit the requested format natively. If yes, the request goes out with provider-specific options that produce that format and the SDK skips re-encoding. If no, the SDK requests the provider's stitch wire format (decodable PCM/WAV), then converts to the user's chosen format locally via mediabunny.

If the provider can't expose any decodable wire format and can't produce the requested format natively, the SDK throws `OutputConversionUnsupportedError`. (The `output` option is also incompatible with providers/models that only emit opaque compressed audio not matching the request.)

On the gateway path, the SDK forwards `output` to the gateway server and the gateway owns format selection.

## Streaming

`streamSpeech` does not accept `output` — the streaming wire format is whatever the provider emits, and re-encoding mid-stream isn't supported. Use `generateSpeech` if you need a specific container.

## Conversation

`output` works on `generateConversation`, including the local-stitch and native-dialogue paths. When `speed` is also active, the SDK defers output conversion until after time-stretching so it doesn't decode/re-encode twice.

## Errors

| Error                                | When                                                                 |
| ------------------------------------ | -------------------------------------------------------------------- |
| `AudioOutputInputError`              | Invalid input shape (e.g. `bitrate` on a non-mp3 format)             |
| `OutputConversionUnsupportedError`   | Provider/model exposes no decodable PCM/WAV mode for local conversion |
