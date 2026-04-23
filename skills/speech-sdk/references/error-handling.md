# Error Handling

```ts
import {
  generateSpeech,
  ApiError,
  NoSpeechGeneratedError,
  GatewayTimestampsUnavailableError,
  SpeechSDKError,
} from "@speech-sdk/core"
```

| Error                              | When                                                                 |
| ---------------------------------- | -------------------------------------------------------------------- |
| `ApiError`                         | Provider returned non-2xx                                            |
| `NoSpeechGeneratedError`           | Empty input (after tag stripping) or empty provider response         |
| `StreamingNotSupportedError`       | `streamSpeech()` on a non-streaming model                            |
| `VolumeAdjustmentUnsupportedError` | `volumeDbfs` with no decodable PCM/WAV output mode                   |
| `TimestampKeyMissingError`         | `timestamps: "on"` fallback STT key missing (message names env var)  |
| `GatewayTimestampsUnavailableError` | Gateway-routed `timestamps: "on"` response has no word timestamps   |
| `SpeechSDKError`                   | Base class for all SDK errors                                        |

## Catching

```ts
try {
  const result = await generateSpeech({ ... })
} catch (error) {
  if (error instanceof ApiError) {
    error.statusCode    // 401, 429, 500, ...
    error.model         // "openai/gpt-4o-mini-tts"
    error.responseBody  // raw body from the API
  } else if (error instanceof SpeechSDKError) {
    console.log(error.message)
  }
}
```

## ApiError

```ts
class ApiError extends SpeechSDKError {
  readonly statusCode: number
  readonly responseBody?: unknown
  readonly model: string
}
```

Common codes: `401` bad key · `403` insufficient perms · `429` rate-limited · `500` provider error (retried).

## NoSpeechGeneratedError

Thrown when no audio can be produced — either the input text was empty (or became empty after tag stripping / preprocessing) or the provider returned a 2xx with empty audio.

## Retries

Retries 5xx and network failures with exponential backoff. Does **not** retry 4xx. Default: 2.

```ts
await generateSpeech({ ..., maxRetries: 5 })
await generateSpeech({ ..., maxRetries: 0 }) // disable
```
