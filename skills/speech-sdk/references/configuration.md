# Configuration

String models read `SPEECH_GATEWAY_API_KEY` from the environment. Factory models call upstream providers directly with provider-specific keys, base URLs, or fetch implementations.

## String Models

```ts
await generateSpeech({
  model: "provider/model",
  text: "Hello!",
  voice: "voice-id",
  apiKey: process.env.SPEECH_GATEWAY_API_KEY,
  timestamps: "on",
  volumeDbfs: -20,
})
```

`apiKey`, `headers`, `abortSignal`, and `maxRetries` are transport/control fields, not request payload. The SDK reserves the `Accept`, `Content-Type`, and `Authorization` request headers — caller-supplied `headers` cannot override them.

## Factory Functions

```ts
import { generateSpeech } from "@speech-sdk/core"
import { createProvider } from "@speech-sdk/core/providers"

const provider = createProvider({
  apiKey: "...",
  baseURL: "https://my-proxy.com/v1",
})

await generateSpeech({
  model: provider("model-id"),
  text: "Hello!",
  voice: "voice-id",
})
```

Factory-created models call the upstream provider directly. Call the factory with no argument to use the provider's default model.

Each factory accepts a config object with these common fields:

- `apiKey` — override the env var
- `baseURL` — custom endpoint (proxy, self-hosted)
- `fetch` — custom fetch implementation

The exact set of factories (and any provider-specific config) is exported from `@speech-sdk/core/providers`. See `providers/<name>.md` for each provider's factory name and any provider-specific config.

## Request Options

`generateSpeech` accepts:

- `model` — string or factory-resolved model
- `text` — input text
- `voice` — string voice ID, `{ audio }`, or `{ url }`
- `providerOptions` — provider-specific, passed through untransformed
- `volumeDbfs` — RMS target loudness (≤ 0)
- `timestamps` — `"on"` or `"off"` (default `"off"`)
- `maxRetries` — default 2; retries 5xx and network errors only
- `abortSignal`, `headers`

### Custom Fetch

```ts
const provider = createProvider({
  fetch: async (url, init) => {
    console.log(`Requesting: ${url}`)
    return globalThis.fetch(url, init)
  },
})
```

### Abort

```ts
const controller = new AbortController()
const promise = generateSpeech({
  model: "provider/model",
  text: "Hello!",
  voice: "voice-id",
  abortSignal: controller.signal,
})
setTimeout(() => controller.abort(), 5000)
```

### Custom Headers

```ts
await generateSpeech({
  model: "provider/model",
  text: "Hello!",
  voice: "voice-id",
  headers: { "X-Custom-Header": "value" },
})
```

### Retries

Retries 5xx and network errors with exponential backoff. Does not retry 4xx. Default: 2.

```ts
await generateSpeech({ ..., maxRetries: 5 })
await generateSpeech({ ..., maxRetries: 0 }) // disable
```
