# Configuration

By default SpeechSDK reads API keys from env vars. Use factory functions when you need custom keys, base URLs, or fetch implementations.

## Factory Functions

```ts
import { generateSpeech } from "@speech-sdk/core"
import { createOpenAI } from "@speech-sdk/core/openai"

const myOpenAI = createOpenAI({
  apiKey: "sk-...",
  baseURL: "https://my-proxy.com/v1",
})

await generateSpeech({
  model: myOpenAI("gpt-4o-mini-tts"),
  text: "Hello!",
  voice: "alloy",
})
```

Call the factory with no arg to use the provider's default model:

```ts
const openai = createOpenAI({ apiKey: "sk-..." })
await generateSpeech({ model: openai(), text: "...", voice: "alloy" })
```

## Available Factories

| Import                           | Function               |
| -------------------------------- | ---------------------- |
| `@speech-sdk/core/openai`        | `createOpenAI()`       |
| `@speech-sdk/core/elevenlabs`    | `createElevenLabs()`   |
| `@speech-sdk/core/deepgram`      | `createDeepgram()`     |
| `@speech-sdk/core/cartesia`      | `createCartesia()`     |
| `@speech-sdk/core/hume`          | `createHume()`         |
| `@speech-sdk/core/google`        | `createGoogle()`       |
| `@speech-sdk/core/fish-audio`    | `createFishAudio()`    |
| `@speech-sdk/core/inworld`       | `createInworld()`      |
| `@speech-sdk/core/murf`          | `createMurf()`         |
| `@speech-sdk/core/resemble`      | `createResemble()`     |
| `@speech-sdk/core/fal-ai`        | `createFal()`          |
| `@speech-sdk/core/mistral`       | `createMistral()`      |
| `@speech-sdk/core/xai`           | `createXai()`          |

## Configuration Options

```ts
interface ProviderConfig {
  apiKey?: string                    // override env var
  baseURL?: string                   // custom endpoint (proxy, self-hosted)
  fetch?: typeof globalThis.fetch    // custom fetch
}
```

### Custom Fetch

```ts
const openai = createOpenAI({
  fetch: async (url, init) => {
    console.log(`Requesting: ${url}`)
    return globalThis.fetch(url, init)
  },
})
```

## Request Options

```ts
interface GenerateSpeechOptions {
  model: string | ResolvedModel
  text: string
  voice: Voice
  providerOptions?: object          // provider-specific, passed through
  maxRetries?: number               // default 2
  abortSignal?: AbortSignal
  headers?: Record<string, string>
}
```

### Abort

```ts
const controller = new AbortController()
const promise = generateSpeech({
  model: "openai/gpt-4o-mini-tts",
  text: "Hello!",
  voice: "alloy",
  abortSignal: controller.signal,
})
setTimeout(() => controller.abort(), 5000)
```

### Custom Headers

```ts
await generateSpeech({
  model: "openai/gpt-4o-mini-tts",
  text: "Hello!",
  voice: "alloy",
  headers: { "X-Custom-Header": "value" },
})
```

### Retries

Retries 5xx and network errors with exponential backoff. Does not retry 4xx. Default: 2.

```ts
await generateSpeech({ ..., maxRetries: 5 })
```
