# Error Handling

```ts
import {
  generateSpeech,
  ApiError,
  NoSpeechGeneratedError,
  SpeechSDKError,
} from "@speech-sdk/core"
```

| Error                    | When                                    |
| ------------------------ | --------------------------------------- |
| `ApiError`               | Provider returned non-2xx               |
| `NoSpeechGeneratedError` | Provider returned empty audio           |
| `SpeechSDKError`         | Base class for all SDK errors           |

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

Thrown when the provider returns a 2xx with empty audio.

## Retries

Retries 5xx and network failures with exponential backoff. Does **not** retry 4xx. Default: 2.

```ts
await generateSpeech({ ..., maxRetries: 5 })
await generateSpeech({ ..., maxRetries: 0 }) // disable
```
