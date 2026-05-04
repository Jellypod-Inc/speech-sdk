# Changelog

## 0.8.3

- Parallel chunked text generation. When the SDK locally chunks text that exceeds a model's `maxInputChars`, chunk requests now fan out concurrently instead of running sequentially.
- New `GenerateSpeechOptions.maxConcurrency` (default `6`) caps the chunk fan-out. Set to `1` to serialize when a provider's account-level concurrency is the bottleneck. Ignored on the gateway path. Validated as a positive integer; throws on `NaN`/non-integer/non-positive values.
- `runStitch` (conversation path) forwards `maxConcurrency` into per-turn `generateSpeech` calls so chunked turns honor the same setting.
- On first chunk failure, in-flight sibling chunks are now aborted instead of running to completion with discarded results.

## 0.8.1

- Public subpath `./pronunciations` exposing `substitute`, `mergeRules`, `inverseAlign`, `ruleMapKey`, and types `Pronunciation`/`PronunciationsInput`/`Edit`.
