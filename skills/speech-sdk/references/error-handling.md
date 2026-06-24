# Error Handling

All SDK errors extend `SpeechSDKError`. Catch the base class to catch any SDK-thrown error, or match a specific subclass for finer-grained handling.

```ts
import {
  generateSpeech,
  ApiError,
  NoSpeechGeneratedError,
  SpeechSDKError,
} from "@speech-sdk/core"
```

| Error                                       | When                                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------------------- |
| `ApiError`                                  | Provider returned non-2xx                                                               |
| `NoSpeechGeneratedError`                    | Empty input (after tag stripping) or empty provider response                            |
| `StreamingNotSupportedError`                | `streamSpeech()` on a non-streaming model                                               |
| `VolumeAdjustmentUnsupportedError`          | `volumeDbfs` requested on a model with no decodable PCM/WAV output mode                 |
| `OutputConversionUnsupportedError`          | `output: { format: ... }` requested on a model with no decodable PCM/WAV output mode    |
| `TextChunkingUnsupportedError`              | Input exceeds `maxInputChars` but the model can't expose decodable PCM/WAV for stitching |
| `AudioOutputInputError`                     | Invalid `output` shape (e.g. `bitrate` on non-mp3)                                      |
| `MissingApiKeyError`                        | `apiKey` not provided and the per-provider env var is unset                             |
| `TimestampKeyMissingError`                  | `timestamps: true` STT fallback triggered but no key configured                         |
| `GatewayInputError`                         | Gateway request invariant violated (e.g. mixing shared + per-turn `model`)              |
| `ConversationInputError`                    | Invalid `generateConversation` input                                                    |
| `DialogueConstraintError`                   | Provider/model can't satisfy the requested turns (more unique voices than supported; a single-voice conversation renders via stitch instead) |
| `MixedDispatchError`                        | Mixing gateway-string turns with direct-factory turns                                   |
| `StitchUnsupportedError`                    | A stitch turn's provider/model can't expose decodable PCM/WAV                           |
| `SpeechSDKError`                            | Base class for all SDK errors                                                           |

## ApiError

```ts
try {
  const result = await generateSpeech({ ... })
} catch (error) {
  if (error instanceof ApiError) {
    error.statusCode    // 401, 429, 500, ...
    error.responseBody  // raw body from the API
    error.code          // optional RFC 7807 problem+json `code` (gateway only)
    error.retryAfterMs  // parsed from `Retry-After` on 429 (RFC 7231 §7.1.3)
    error.turnIndex     // 0-based turn index on the conversation stitch path; undefined otherwise
  } else if (error instanceof SpeechSDKError) {
    console.log(error.message)
  }
}
```

`ApiError.code` is populated when the upstream sets a problem+json `code` extension. Match on `err.code` over parsing `err.message`.

## NoSpeechGeneratedError

Thrown when no audio can be produced — either the input text was empty (or became empty after tag stripping / preprocessing) or the provider returned a 2xx with empty audio. On the conversation stitch path, `err.turnIndex` identifies which turn produced no audio.

## Retries

Retries 5xx, 429 (honoring `Retry-After`), and network failures with exponential backoff. 501 is treated as terminal. Other 4xx are not retried. Default: 2.

```ts
await generateSpeech({ ..., maxRetries: 5 })
await generateSpeech({ ..., maxRetries: 0 }) // disable
```
