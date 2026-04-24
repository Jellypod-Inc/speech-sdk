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
  readonly code?: string   // RFC 7807 problem+json `code` extension
}
```

Common statuses: `401` bad key · `403` insufficient perms · `429` rate-limited · `500` provider error (retried).

### ApiError.code (stable machine-readable codes)

`ApiError.code` is populated from the RFC 7807 `application/problem+json` `code` extension when the upstream surface provides one. It is **optional** — direct-provider responses (OpenAI, ElevenLabs, etc.) typically do not set it, so `err.code` is `undefined`. Currently the Speech Gateway is the only upstream that emits it.

Match on `err.code` rather than parsing `err.message` text when you need to branch programmatically — message text is not a stable contract, but codes are.

```ts
try {
  await generateConversation({
    model: "openai/gpt-4o-mini-tts",
    turns: [...],
    timestamps: "on",
  })
} catch (error) {
  if (error instanceof ApiError && error.code === "timestamps_unsupported") {
    // Speech Gateway 501 — this model can't return word timestamps through
    // the gateway conversation endpoint yet. Retry with timestamps: "off"
    // or switch to a model in the supported set.
    return retryWithoutTimestamps()
  }
  throw error
}
```

Known codes surfaced by the Speech Gateway today:

| `code`                    | Status | Meaning                                                                                                |
| ------------------------- | ------ | ------------------------------------------------------------------------------------------------------ |
| `timestamps_unsupported`  | 501    | Conversation request with `timestamps: "on"` targeting a model / configuration the gateway can't align |

Callers should treat any unknown `code` value as an opaque string — new codes can be added server-side without an SDK release. If `err.code` is `undefined`, fall back to branching on `err.statusCode`.

## NoSpeechGeneratedError

Thrown when no audio can be produced — either the input text was empty (or became empty after tag stripping / preprocessing) or the provider returned a 2xx with empty audio.

## Retries

Retries 5xx and network failures with exponential backoff. Does **not** retry 4xx. Default: 2.

```ts
await generateSpeech({ ..., maxRetries: 5 })
await generateSpeech({ ..., maxRetries: 0 }) // disable
```
