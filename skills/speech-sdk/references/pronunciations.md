# Pronunciations

Pass `pronunciations` on `generateSpeech`, `streamSpeech`, or `generateConversation` to substitute words before synthesis. Useful for proper nouns, brand names, technical terms, and accent control.

```ts
import { generateSpeech } from "@speech-sdk/core"

const result = await generateSpeech({
  model: "provider/model",
  text: "Welcome to Jellypod, a podcast platform.",
  voice: "voice-id",
  pronunciations: {
    rules: [
      { word: "Jellypod", replacement: "JELL-ee-pod" },
    ],
  },
})
```

## Shape

```ts
pronunciations: {
  rules?: Array<{
    word: string                // input token to match (case-insensitive by default)
    replacement: string         // text to send to the provider in place of `word`
    caseSensitive?: boolean
  }>
  dictionaryIds?: string[]      // gateway-only — references stored dictionaries
}
```

Both fields are optional, but at least one must produce a substitution for the option to do anything. Empty `word` or `replacement` strings throw a `SpeechSDKError` synchronously.

## Inline Rules

Rules are applied client-side before the text is sent to the provider. Matching is whole-word; `caseSensitive: false` (the default) matches any case but the replacement is sent verbatim.

```ts
pronunciations: {
  rules: [
    { word: "Anthropic", replacement: "an-THROW-pick" },
    { word: "Claude", replacement: "Clohd" },
    { word: "API", replacement: "A. P. I.", caseSensitive: true },
  ],
}
```

## Stored Dictionaries (Gateway Only)

`dictionaryIds` references dictionaries stored server-side. It only works through the speech gateway:

```ts
await generateSpeech({
  model: "openai/gpt-4o-mini-tts",     // gateway string
  text: "...",
  voice: "alloy",
  pronunciations: {
    dictionaryIds: ["brand-terms", "product-names"],
    rules: [{ word: "v0", replacement: "vee zero" }], // also allowed alongside
  },
})
```

Passing `dictionaryIds` to a direct-provider factory throws `DictionaryIdsRequireGatewayError`. The TypeScript types enforce this at compile time too: when `model` is a `ResolvedModel` (factory output), the option type drops `dictionaryIds`.

## Timestamps

When pronunciation rules substitute words and `timestamps: true` is set, the SDK inverse-aligns the returned timestamps so each entry's `text` and offsets reference the **original** input token rather than the substituted form. Callers consuming timestamps don't need to undo the substitution themselves.

## Errors

| Error                                | When                                                                  |
| ------------------------------------ | --------------------------------------------------------------------- |
| `SpeechSDKError`                     | `word` or `replacement` empty, or `dictionaryIds` entry empty         |
| `DictionaryIdsRequireGatewayError`   | `dictionaryIds` passed to a direct-provider path                      |

## Subpath Export

The substitution / inverse-alignment helpers are exported from `@speech-sdk/core/pronunciations` for callers building tooling on top of the SDK:

```ts
import {
  inverseAlign,
  mergeRules,
  substitute,
  type Pronunciation,
  type PronunciationsInput,
} from "@speech-sdk/core/pronunciations"
```

Most callers don't need this — pass `pronunciations` to `generateSpeech` and the SDK does the rest.
