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

| Error                              | When                                                                 |
| ---------------------------------- | -------------------------------------------------------------------- |
| `ApiError`                         | Provider returned non-2xx                                            |
| `NoSpeechGeneratedError`           | Empty input (after tag stripping) or empty provider response         |
| `StreamingNotSupportedError`       | `streamSpeech()` on a non-streaming model                            |
| `VolumeAdjustmentUnsupportedError` | `volumeDbfs` with no decodable PCM/WAV output mode                   |
| `TimestampKeyMissingError`         | `timestamps: "on"` STT fallback triggered but no key configured      |
| `GatewayTimestampsUnavailableError` | A `provider/model` string `timestamps: "on"` response had no word timestamps |
| `SpeechSDKError`                   | Base class for all SDK errors                                        |

## Catching

```ts
try {
  const result = await generateSpeech({ ... })
} catch (error) {
  if (error instanceof ApiError) {
    error.statusCode    // 401, 429, 500, ...
    error.responseBody  // raw body from the API
    error.code          // optional RFC 7807 problem+json `code`
  } else if (error instanceof SpeechSDKError) {
    console.log(error.message)
  }
}
```

`ApiError.code` is populated when the upstream sets a problem+json `code` extension. Match on `err.code` over parsing `err.message`.

## NoSpeechGeneratedError

Thrown when no audio can be produced — either the input text was empty (or became empty after tag stripping / preprocessing) or the provider returned a 2xx with empty audio.

## Retries

Retries 5xx and network failures with exponential backoff. Does **not** retry 4xx. Default: 2.

```ts
await generateSpeech({ ..., maxRetries: 5 })
await generateSpeech({ ..., maxRetries: 0 }) // disable
```
