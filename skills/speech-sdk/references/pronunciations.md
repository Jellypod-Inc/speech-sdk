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
}
```

`rules` is optional, but it must produce a substitution for the option to do anything. Empty `word` or `replacement` strings throw a `SpeechSDKError` synchronously.

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

## IPA

Rules can also be `{ word, respelling, ipa?, caseSensitive? }`; `replacement` above is the original name for `respelling` and both are accepted. Models that read IPA (Gemini 3.8) receive `ipa`; every other model receives `respelling`. `ipa` should be plain IPA; each provider formats it the way its models read it (Google: wrapped as `/…/`). A value already wrapped in slashes is sent unchanged.

## Timestamps

When pronunciation rules substitute words and `timestamps: true` is set, the SDK inverse-aligns the returned timestamps so each entry's `text` and offsets reference the **original** input token rather than the substituted form. Callers consuming timestamps don't need to undo the substitution themselves.

## Errors

| Error                                | When                                                                  |
| ------------------------------------ | --------------------------------------------------------------------- |
| `SpeechSDKError`                     | `word` or `replacement` empty                                         |

## Subpath Export

The substitution / inverse-alignment helpers are exported from `@speech-sdk/core/pronunciations` for callers building tooling on top of the SDK:

```ts
import {
  inverseAlign,
  mergeRules,
  resolvePronunciations,
  substitute,
  targetReadsIpa,
  type Pronunciation,
  type PronunciationsInput,
} from "@speech-sdk/core/pronunciations"
```

- `resolvePronunciations(text, rules, { provider, model? })`: the rules synthesis applies to `text` for that target, with the exact replacement it sends.
- `targetReadsIpa({ provider, model? })`: whether this provider/model is sent a rule's IPA form; an omitted model means the provider's default.

Most callers don't need this — pass `pronunciations` to `generateSpeech` and the SDK does the rest.
