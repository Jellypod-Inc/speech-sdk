# Configuration

String models read `SPEECH_GATEWAY_API_KEY` from the environment. Factory models call upstream providers directly with provider-specific keys, base URLs, or fetch implementations.

## String Models

```ts
await generateSpeech({
  model: "provider/model",
  text: "Hello!",
  voice: "voice-id",
  apiKey: process.env.SPEECH_GATEWAY_API_KEY,
  timestamps: true,
  volumeDbfs: -20,
})
```

`apiKey`, `headers`, `abortSignal`, `maxRetries`, `maxConcurrency`, and `maxInputChars` are transport/control fields, not request payload. The SDK reserves the `Content-Type` and `Authorization` request headers — caller-supplied `headers` cannot override them.

## Factory Functions

```ts
import { generateSpeech } from "@speech-sdk/core"
import { createOpenAI } from "@speech-sdk/core/providers"

const openai = createOpenAI({
  apiKey: "sk-...",
  baseURL: "https://my-proxy.com/v1",
})

await generateSpeech({
  model: openai("gpt-4o-mini-tts"),
  text: "Hello!",
  voice: "alloy",
})
```

Factory-created models call the upstream provider directly. Call the factory with no argument to use the provider's default model.

Each factory accepts a config object with these common fields:

- `apiKey` — override the env var
- `baseURL` — custom endpoint (proxy, self-hosted)
- `fetch` — custom fetch implementation
- `fallbackSTT` — resolved STT model (from `<otherFactory>().stt(...)`) used when `timestamps: true` and the chosen TTS model has no native alignment

The exact set of factories (and any provider-specific config) is exported from `@speech-sdk/core/providers`. See `providers/<name>.md` for each provider's factory name and any provider-specific config. Factories: `createOpenAI`, `createElevenLabs`, `createDeepgram`, `createCartesia`, `createHume`, `createGoogle`, `createFishAudio`, `createInworld`, `createMurf`, `createResemble`, `createFal`, `createMistral`, `createXai`, `createSmallestAI`, `createSpeechGateway`.

## Request Options

`generateSpeech` accepts:

- `model` — string or factory-resolved model
- `text` — input text
- `voice` — string voice ID, `{ audio }`, or `{ url }`
- `providerOptions` — provider-specific, passed through untransformed
- `output` — `{ format: "wav" | "pcm" | "mp3", bitrate? }` (mp3 only)
- `speed` — `0.75–1.5`, default `1`
- `volumeDbfs` — RMS target loudness (≤ 0)
- `timestamps` — boolean, default `false`
- `pronunciations` — `{ rules, dictionaryIds? }`; `dictionaryIds` is gateway-only
- `moderationRulesetId` — gateway-only; throws `ModerationRulesetIdRequiresGatewayError` on direct providers
- `maxInputChars` — override per-model chunk threshold (direct path only; ignored on the gateway)
- `maxConcurrency` — chunk request parallelism on the auto-chunking path (default 6, direct path only)
- `maxRetries` — default 2; retries 5xx, 429 (honors `Retry-After`), and network only
- `apiKey`
- `abortSignal`, `headers`

`streamSpeech` accepts a smaller set: `model`, `text`, `voice`, `providerOptions`, `pronunciations` (rules only — `dictionaryIds` is gateway-only), `moderationRulesetId`, `maxRetries`, `apiKey`, `abortSignal`, `headers`. `output`, `speed`, `volumeDbfs`, `timestamps`, `maxInputChars`, and `maxConcurrency` require buffering and are not accepted.

### Custom Fetch

```ts
const openai = createOpenAI({
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

Retries 5xx, 429, and network errors with exponential backoff. 429 honors `Retry-After`. 501 is treated as terminal (gateway uses it for "this capability will never work for this model"). 4xx other than 429 are not retried. Default: 2.

```ts
await generateSpeech({ ..., maxRetries: 5 })
await generateSpeech({ ..., maxRetries: 0 }) // disable
```
