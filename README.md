<div align="center">

<img src="https://github.com/user-attachments/assets/42d9b528-e507-4162-8120-338bb0c92650" alt="Speech SDK" width="140" />

# Speech SDK

**The Universal SDK for text-to-speech across all major providers**

A lightweight, provider-agnostic TypeScript SDK. Zero lock-in. Runs in Node.js, Edge runtimes, and the browser.

[![npm version](https://img.shields.io/npm/v/@speech-sdk/core?style=flat-square)](https://www.npmjs.com/package/@speech-sdk/core)
[![npm downloads](https://img.shields.io/npm/dm/@speech-sdk/core?style=flat-square)](https://www.npmjs.com/package/@speech-sdk/core)
[![license](https://img.shields.io/npm/l/@speech-sdk/core?style=flat-square)](https://github.com/Jellypod-Inc/speech-sdk/blob/main/LICENSE)
[![Discord](https://img.shields.io/badge/Discord-Join-5865F2?style=flat-square&logo=discord&logoColor=white)](https://discord.gg/xcTQMU3nCV)
[![Stars](https://img.shields.io/github/stars/Jellypod-Inc/speech-sdk?style=flat-square&logo=github&label=stars)](https://github.com/Jellypod-Inc/speech-sdk/stargazers)

**[Quick start](#quick-start)** · **[Providers](#supported-providers)** · **[Streaming](#streaming)** · **[Multi-Speaker Conversations](#conversations)** · **[Timestamps](#timestamps)**

</div>

<br />

<img width="1200" height="630" alt="Speech SDK" src="https://github.com/user-attachments/assets/b90c0235-9405-4939-bffa-75fc82be5afb" />

Learn more at [speechsdk.dev](https://speechsdk.dev/).

## Features

- **Universal** — one `generateSpeech()` call across every supported provider.
- **Streaming** — `streamSpeech()` returns a standard `ReadableStream<Uint8Array>`.
- **Conversations** — `generateConversation()` produces multi-speaker audio, picking a native-dialogue or local-stitch path automatically.
- **Word-level timestamps** — `timestamps: true` returns alignment, using the provider's native data or falling back to STT.
- **Volume normalization** — RMS-level outputs to an absolute loudness target.
- **Audio tags & voice cloning** — bracket cues like `[laugh]` and reference-audio cloning where supported.
- **Voice design** — `designVoice()` creates a reusable voice from a text description across providers that support it.

## Install

```bash
npm install @speech-sdk/core
```

> [!TIP]
> Using an AI coding assistant? Add the speech-sdk skill to give it full knowledge of this library: `npx skills add Jellypod-Inc/speech-sdk --skill speech-sdk`.

## Quick start

```ts
import { generateSpeech } from '@speech-sdk/core';

const result = await generateSpeech({
  model: 'openai/gpt-4o-mini-tts',
  text: 'Hello from speech-sdk!',
  voice: 'alloy',
});

result.audio.uint8Array;  // Uint8Array
result.audio.base64;      // string (lazy)
result.audio.mediaType;   // "audio/mpeg"
```

Pass a `provider/model` string, or just the provider name to use its default model. The string above is enough to get going — set one env var and you're done.

### Spoken text and delivery instructions

`text` is always the exact transcript expected in the generated audio. Use `instructions` for optional, non-spoken direction about delivery; instructions are sent only to the TTS provider and are never included in forced alignment or timestamp validation.

```ts
import { generateSpeech } from '@speech-sdk/core';
import { createGoogle } from '@speech-sdk/core/providers';

const result = await generateSpeech({
  model: createGoogle()('gemini-3.8-flash-lite-tts'),
  voice: 'Kore',
  text: 'The exact words expected in the generated audio.',
  instructions: 'Use a confident, warm, measured delivery.',
  timestamps: true,
  timestampProvider,
});
```

Models that accept this field declare the `instructions` feature. Passing non-empty instructions to an unsupported direct model throws `InstructionsUnsupportedError` before synthesis. Existing `text`-only calls and provider-specific `providerOptions` are unchanged.

## Model string vs factory

Every call goes straight to the provider's own API. The two ways to name a model differ only in how much you configure:

```ts
// 1. String → "<provider>/<model>", resolved to that provider with default config.
//    Reads the provider's env var (e.g. OPENAI_API_KEY), or pass apiKey to the call.
await generateSpeech({ model: 'openai/gpt-4o-mini-tts', text: '...', voice: 'alloy' });

// 2. Factory → same provider, plus baseURL / fetch / fallbackSTT and other config.
import { createOpenAI } from '@speech-sdk/core/providers';
await generateSpeech({ model: createOpenAI()('gpt-4o-mini-tts'), text: '...', voice: 'alloy' });
```

| | String | Factory |
|---|---|---|
| When to use | The common case — one key per provider, nothing to configure | You need a custom `baseURL`, a custom `fetch`, an STT fallback, or several differently-configured instances of one provider |
| Key resolution | `apiKey` option → `<PROVIDER>_API_KEY` | `createX({ apiKey })` → `<PROVIDER>_API_KEY` |

A bare provider id (`'openai'`) uses that provider's default model. An unrecognized prefix throws before any request is made.

## Supported providers

| Provider | Prefix | Env var |
|---|---|---|
| [OpenAI](https://platform.openai.com/docs/guides/text-to-speech) | `openai` | `OPENAI_API_KEY` |
| [ElevenLabs](https://elevenlabs.io/docs) | `elevenlabs` | `ELEVENLABS_API_KEY` |
| [Deepgram](https://developers.deepgram.com/docs/text-to-speech) | `deepgram` | `DEEPGRAM_API_KEY` |
| [Cartesia](https://docs.cartesia.ai) | `cartesia` | `CARTESIA_API_KEY` |
| [Hume](https://dev.hume.ai/docs/text-to-speech-tts/overview) | `hume` | `HUME_API_KEY` |
| [Inworld](https://docs.inworld.ai/tts) | `inworld` | `INWORLD_API_KEY` |
| [Google Gemini TTS](https://docs.cloud.google.com/text-to-speech/docs/gemini-tts) | `google` | `GOOGLE_API_KEY` |
| [Fish Audio](https://docs.fish.audio) | `fish-audio` | `FISH_AUDIO_API_KEY` |
| [Gradium](https://docs.gradium.ai) | `gradium` | `GRADIUM_API_KEY` |
| [Lokutor](https://docs.lokutor.com) | `lokutor` | `LOKUTOR_API_KEY` |
| [Murf](https://murf.ai/api/docs) | `murf` | `MURF_API_KEY` |
| [Resemble](https://docs.resemble.ai) | `resemble` | `RESEMBLE_API_KEY` |
| [fal](https://fal.ai/models) | `fal-ai` | `FAL_API_KEY` |
| [Mistral](https://docs.mistral.ai/capabilities/audio/text_to_speech/speech) | `mistral` | `MISTRAL_API_KEY` |
| [xAI](https://docs.x.ai/docs/models) | `xai` | `XAI_API_KEY` |
| [MiniMax](https://platform.minimax.io/docs/api-reference/speech-t2a-http) | `minimax` | `MINIMAX_API_KEY` |
| [Speechify](https://docs.speechify.ai) ([voice IDs](https://docs.speechify.ai/build/api-reference/v1/voices/get)) | `speechify` | `SPEECHIFY_API_KEY` |

The prefix is what a string `model` like `"openai/tts-1"` resolves to, and the env var supplies the key for both the string and factory forms — see [Model string vs factory](#model-string-vs-factory). Most providers ship a default model (`createOpenAI()()`); a few (e.g. fal) require an explicit model id. See the linked docs for each provider's full model list.

Provider-specific parameters pass through via `providerOptions` using each API's native field names.

## Streaming

`streamSpeech()` returns audio incrementally as a `ReadableStream<Uint8Array>`.

```ts
import { streamSpeech } from '@speech-sdk/core';

const { audio, mediaType } = await streamSpeech({
  model: 'cartesia/sonic-3.5',
  text: 'Streaming straight to the client.',
  voice: 'voice-id',
});

// Forward to an HTTP response:
return new Response(audio, { headers: { 'Content-Type': mediaType } });
```

> [!NOTE]
> Retries apply only until response headers arrive; mid-stream errors propagate to the consumer. Calling `streamSpeech()` on a non-streaming model throws `StreamingNotSupportedError`.

### Streaming a conversation

`streamConversation()` streams native two-speaker dialogue, so playback can start before the whole conversation has been generated. Gemini 3.8 (`gemini-3.8-flash-tts`, `gemini-3.8-flash-lite-tts`) supports it.

```ts
import { streamConversation } from '@speech-sdk/core';
import { createGoogle } from '@speech-sdk/core/providers';

const google = createGoogle();

const { audio, mediaType } = await streamConversation({
  model: google('gemini-3.8-flash-tts'),
  turns: [
    { text: 'Did you see the results?', voice: 'Kore' },
    { text: '[laughs] I did.', voice: 'Puck', instructions: 'dry and amused' },
  ],
});
// mediaType: 'audio/pcm;rate=24000'
```

It sends the same single request as `generateConversation` renders natively, with streaming on, and supports `instructions` (conversation-wide and per turn), `pronunciations`, `providerOptions`, `maxRetries`, `abortSignal` and `headers`. Retries work as for `streamSpeech()`.

- **One request, so it must fit native dialogue:** exactly two prebuilt voices, and no more than the model's dialogue character budget (8,000 characters of turn text for Gemini 3.8). Otherwise it throws `DialogueConstraintError`. Use `generateConversation()` for longer conversations, which splits them into blocks.
- **No fallback.** A model that can't stream dialogue throws `StreamingNotSupportedError`; fall back to `generateConversation()` yourself if you want buffered audio.
- **Buffered-only options are rejected**, not ignored: `gapMs`, `maxConcurrency`, `maxInputChars`, `output`, `speed`, `splitTurns`, `spokenTagCheck`, `timestampProvider`, `timestamps`, `volumeDbfs`, and per-turn `model`, `providerOptions` or `speed` throw `ConversationInputError`.

## Conversations

`generateConversation()` produces a single multi-voice clip from an ordered array of turns. The path is chosen by what the turns are:

- **Native dialogue** — every turn uses the same model and that model exposes a multi-speaker endpoint. One API call, naturally mixed.
- **Stitch** — conversations that don't qualify for native dialogue (multi-provider, or no dialogue endpoint). Runs turns in parallel, RMS-levels each, inserts silence, returns a single WAV.

```ts
import { generateConversation } from '@speech-sdk/core';

const result = await generateConversation({
  turns: [
    { model: 'openai/tts-1',                     voice: 'nova',                 text: "Hi, I'm hosted by OpenAI." },
    { model: 'elevenlabs/eleven_multilingual_v2', voice: 'JBFqnCBsd6RMkjVDRZzb', text: "And I'm hosted by ElevenLabs." },
    { model: 'hume/octave-2',                    voice: 'Kora',                 text: "I'm Hume Octave. Thanks for listening." },
  ],
});
```

Options: `gapMs` (default 300), `volumeDbfs` (default `-20`), `maxConcurrency` (default 6), `maxRetries` (default 2), `instructions`, `timestamps`, `splitTurns`, `timestampProvider`, `spokenTagCheck`, `apiKey`, `providerOptions`, `abortSignal`, `headers`. Per-turn overrides: `model`, `instructions`, `providerOptions` (stitch path only — throws `ConversationInputError` on native). Top-level and per-turn instructions are combined for stitched turns; native dialogue keeps them semantically separate. Native-dialogue models enforce their own voice-count and character limits; violations throw `DialogueConstraintError`.

`result.metadata.path` reports how the audio was rendered: `'native'`, `'native-split'` (native dialogue in several calls, stitched), or `'stitch'`. On the stitch path `metadata.stitchReason` says why (`'mixed-models'`, `'no-native-dialogue'`, `'single-speaker'`, `'too-many-voices'`, `'custom-voice'`, `'per-turn-provider-options'`, `'per-turn-speed'`, `'max-input-chars'`, `'native-limit-exceeded'`). Match on these fields rather than on warning text.

### Per-turn audio

Pass `splitTurns: true` (with `timestamps: true`) to also get one clip per input turn — for example to show each turn as its own take, caption it, or regenerate a single turn.

```ts
import { generateConversation } from '@speech-sdk/core';
import { createElevenLabs } from '@speech-sdk/core/providers';

const result = await generateConversation({
  model: 'google/gemini-3.8-flash-tts',
  turns: [
    { voice: 'Kore', text: '[laughs] You did not.' },
    { voice: 'Puck', text: 'I absolutely did.' },
  ],
  timestamps: true,
  // Gemini returns no word timings, so align them with a timestamp provider.
  timestampProvider: createElevenLabs().forcedAlignment(),
  splitTurns: true,
  output: { format: 'wav' },
});

for (const turn of result.turns) {
  turn.turnIndex;   // index into turns[]
  turn.audio;       // GeneratedAudioFile, same format as result.audio
  turn.startMs;     // where the slice starts in result.audio
  turn.endMs;
  turn.timestamps;  // WordTimestamp[] in seconds from the start of this slice
}
```

The slices cover the whole conversation audio in order, with no gaps or overlaps, and are cut sample-accurately from the decoded PCM. Each boundary is cut in the middle of the first silence (at least 100 ms of 20 ms frames, each 40 dB below the audio's 90th-percentile frame level) after turn N's last word and before turn N+1's first word, so a breath, laugh, or "hmm" opening turn N+1 stays with that turn. When the gap holds no such silence, the cut goes at its quietest frame. Where the SDK joined audio itself — the stitch path's inserted gaps and the joins between native-split blocks — it cuts in the middle of that gap.

Splitting works on the native, native-split, and stitch paths. It throws `TurnSplitError` rather than cut on untrustworthy boundaries; `error.reason` is `'empty_turn'` (a turn has no attributed words), `'non_monotonic'` (a word overlaps the previous one or belongs to an earlier turn), or `'undecodable_audio'` (the native model has no PCM/WAV mode; thrown before synthesis). Callers can catch it and fall back to voicing turns separately.

## Timestamps

Pass `timestamps` to get word-level alignment. Timings are in seconds from the start of the audio.

```ts
const result = await generateSpeech({
  model: 'elevenlabs/eleven_multilingual_v2',
  text: 'Hello from speech-sdk!',
  voice: 'JBFqnCBsd6RMkjVDRZzb',
  timestamps: true,
});

result.timestamps;
// [
//   { text: "Hello",  start: 0.00, end: 0.32 },
//   { text: "from",   start: 0.36, end: 0.55 },
//   ...
// ]
```

Returned timestamps are projected onto the exact text synthesized by the SDK: caller input after unsupported audio tags are removed and pronunciation substitutions are applied. Provider text is used only to prove complete lexical coverage and provide timing boundaries. Before timestamps are accepted, the SDK verifies Unicode-aware transcript coverage, rejects missing or extra lexical content and punctuation-only entries, and validates finite, nonnegative, monotonic timings against the generated audio. Pronunciation substitutions are mapped back to caller text before timestamps are returned. If replacement boundaries cannot map one-to-one onto multiple caller words, only the unresolved internal boundaries are interpolated and `warnings` reports that the pronunciation projection contains estimated word timings.

| Value | Behavior |
|---|---|
| `true` | Returns validated word timestamps. Native models use their own timestamps. Direct models without native timestamps require `timestampProvider` (or a legacy factory-level `fallbackSTT`). |
| `false` *(default)* | Never requests, derives, or returns timestamps. |

`timestampProvider` is used for models without native timestamps and as a fallback when native timestamps fail validation. Missing internal caller-word boundaries inside an otherwise valid pronunciation edit span are interpolated, and those results include a warning.

Timestamps never fail synthesis. When the SDK chunks a long input, forced alignment runs per synthesis chunk and the timings are concatenated with the stitch offsets; alignment is skipped entirely for inputs below a few words, where it cannot succeed and is not needed. If timings are still empty or fail transcript validation, the SDK distributes the words evenly across the measured audio duration (a single span for one word) instead of throwing. `metadata.timestampsSource` reports how the returned timings were produced: `'native'`, `'aligned'`, or `'estimated'`.

There is no implicit OpenAI fallback. Existing factory-level `fallbackSTT` configuration remains supported for compatibility, but new integrations should use the narrower `timestampProvider` interface.

Configure `fallbackSTT` on the factory to use a different key or STT model (set it once, applies to all calls):

```ts
import { generateSpeech } from '@speech-sdk/core';
import { createOpenAI, createElevenLabs } from '@speech-sdk/core/providers';

const elevenlabs = createElevenLabs({
  apiKey: process.env.ELEVENLABS_API_KEY,
  fallbackSTT: createOpenAI({ apiKey: process.env.MY_OPENAI_KEY }).stt('whisper-1'),
});

const result = await generateSpeech({
  model: elevenlabs('eleven_flash_v2'),
  voice: 'JBFqnCBsd6RMkjVDRZzb',
  text: 'Hello, world.',
  timestamps: true,
});
```

Whether a given model returns native alignment or transcribes via the STT fallback is a provider detail — both paths produce the same `WordTimestamp[]` shape.

### ElevenLabs Forced Alignment

[ElevenLabs Forced Alignment](https://elevenlabs.io/docs/api-reference/forced-alignment/create/) is available as a timestamp provider. It sends the generated audio and exact synthesized text to ElevenLabs; it is never selected as a default.

```ts
import { generateSpeech } from '@speech-sdk/core';
import { createElevenLabs } from '@speech-sdk/core/providers';

const elevenlabs = createElevenLabs({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

const result = await generateSpeech({
  model: elevenlabs('eleven_multilingual_v2'),
  voice: 'JBFqnCBsd6RMkjVDRZzb',
  text: 'Dr. Smith paid 12 dollars',
  timestamps: true,
  timestampProvider: elevenlabs.forcedAlignment(),
});

result.timestamps;
// [{ text: 'Dr.', ... }, { text: 'Smith', ... }, { text: 'paid', ... }, { text: '12', ... }, { text: 'dollars', ... }]

```

Any object implementing the exported `TimestampProvider` interface can be passed the same way. It receives generated audio, its media type, the exact synthesized text, and the request's abort signal. Provider, network, and validation failures during alignment don't discard the synthesized audio — the SDK falls back to evenly estimated timings and reports it via `metadata.timestampsSource`.

`generateConversation` retains its boolean `timestamps` option and returns `ConversationWordTimestamp[]` — every word carries a `turnIndex: number` pointing back into the input `turns[]`.

```ts
import { generateConversation, timestampsToTurns } from '@speech-sdk/core';

const result = await generateConversation({
  model: 'elevenlabs/eleven_v3',
  turns: [
    { voice: 'rachel', text: 'Hi there.' },
    { voice: 'adam',   text: 'Hello!' },
  ],
  timestamps: true,
});

// Collapse consecutive words from the same turn into per-turn timings:
const turnTimestamps = timestampsToTurns(result.timestamps ?? []);
```

### Captions (SRT / WebVTT)

`timestampsToCaptions()` converts word-level timestamps into a caption file. SRT is the default; pass `format: 'vtt'` for WebVTT.

```ts
import { generateSpeech, timestampsToCaptions } from '@speech-sdk/core';

const { timestamps } = await generateSpeech({
  model: 'elevenlabs/eleven_v3',
  text: 'Hello world. This is a test.',
  voice: 'JBFqnCBsd6RMkjVDRZzb',
  timestamps: true,
});

const srt = timestampsToCaptions(timestamps ?? []);
const vtt = timestampsToCaptions(timestamps ?? [], { format: 'vtt' });
```

Cues break on sentence boundaries, then subdivide long sentences by character count, cue duration, and soft comma breaks. Pass `CaptionsOptions` to customize `format`, `maxLineLength`, `maxLinesPerCue`, `maxCharsPerCue`, `maxCueDurationMs`, or `longPhraseCommaBreakChars`.

## Volume normalization

Pass `volumeDbfs` to RMS-normalize to an absolute target loudness (must be ≤ 0; `-20` is the broadcast/podcast convention).

```ts
const result = await generateSpeech({
  model: 'openai/gpt-4o-mini-tts',
  text: 'Hello!',
  voice: 'alloy',
  volumeDbfs: -20,
});

result.audio.mediaType;  // "audio/wav" — re-encoded after normalization
```

`generateConversation` always normalizes; override the target with `volumeDbfs`. A warning is surfaced (and the raw mix passes through) if the provider has no decodable PCM/WAV mode.

### Output format

By default, `generateSpeech` preserves the provider response format.
`generateConversation` returns WAV when the SDK stitches the turns.

Pass `output` to request a specific final format:

```ts
const result = await generateSpeech({
  model: createOpenAI()('tts-1'),
  voice: 'alloy',
  text: 'Hello',
  output: { format: 'mp3', bitrate: 96 },
});

result.audio.mediaType; // "audio/mpeg"
```

Supported explicit formats are `wav`, `mp3`, and `pcm`.

The SDK first asks each provider whether it can natively produce the requested format. If yes, the provider returns it directly and the SDK passes the bytes through unchanged. If the provider can return WAV/PCM but not the requested format (e.g. ElevenLabs has no native WAV output, Cartesia has no native MP3), the SDK requests a decodable format and converts via mediabunny. The SDK never decodes compressed audio (mp3/opus/aac) — providers must return wav/pcm for any local conversion to succeed.

MP3 encoding uses [`@mediabunny/mp3-encoder`](https://mediabunny.dev/guide/extensions/mp3-encoder), loaded dynamically only when MP3 output is requested and the host environment does not already provide native MP3 encoding.

## Audio tags

Bracket syntax `[tag]` adds expressive cues. Each provider handles tags natively where supported, maps them to its closest equivalent, or strips them and surfaces a warning in `result.warnings`.

```ts
await generateSpeech({
  model: 'elevenlabs/eleven_v3',
  text: '[laugh] Oh that is so funny! [sigh] But seriously though.',
  voice: 'voice-id',
});
```

### Spoken-tag check

A voice that supports tags sometimes reads one aloud: `'...a daring dream. [curious] In 1962...'` comes back with the narrator saying "curious". Forced alignment only places the script's own words, so it can't see that extra word and leaves an unexplained gap in the timings. The SDK checks for this automatically whenever tags reach the model:

```ts
import { generateSpeech } from '@speech-sdk/core';
import { createElevenLabs } from '@speech-sdk/core/providers';

const elevenlabs = createElevenLabs();

const result = await generateSpeech({
  model: 'google/gemini-3.1-flash-tts-preview',
  voice: 'Kore',
  text: 'It was a daring dream. [curious] In 1962, Britain and France signed.',
  timestamps: true,
  timestampProvider: elevenlabs.forcedAlignment(), // also listens for spoken tags
});

result.metadata.spokenTags;
// { checked: true, removedSeconds: 1.02, spans: 1 }
```

**What it listens with.** The first transcriber the request already has, so it never adds a vendor you didn't configure:

1. `spokenTagCheck`, if you pass one (`elevenlabs.transcription()` or any `TranscriptionProvider`).
2. A `timestampProvider` that implements the optional `transcribe` method. `elevenlabs.forcedAlignment()` does, via Scribe v2 on the same key.
3. The model's `fallbackSTT`.
4. The model's own speech-to-text: ElevenLabs models use Scribe with their own key, so `elevenlabs/eleven_v3` is checked with no configuration.

With none of those, the audio is returned as synthesized and `metadata.spokenTags.failed` says why. Pass `spokenTagCheck: false` to turn the check off.

**What it does.** Each synthesized chunk whose text still carries a tag when it reaches the model is transcribed. Heard words the script doesn't account for and that spell a tag are spliced out of the chunk's PCM, from the middle of the pause before to the middle of the pause after, with a 4 ms fade on each side of the join. A word the script itself says is kept: in `'Engineers were curious. [curious]'` only the extra "curious" goes. Single tag words shorter than 4 letters are only cut as part of a whole tag phrase.

- **One call for timestamps where possible.** When the transcriber is also your aligner (a transcribing `timestampProvider`, or `fallbackSTT`) and it heard every script word as written, its word timings become the timestamps and forced alignment is skipped. If it wrote something differently (`"1962"` heard as "nineteen sixty-two", an unusual name), forced alignment runs on the clean chunk as usual. Chunks without tags are aligned exactly as before, with no transcription call.
- **Order.** The check runs on each chunk after synthesis and decoding, and before chunk stitching, forced alignment, `speed`, `output` encoding, and conversation turn splitting, so all of those see clean audio. On native dialogue the whole dialogue request is checked against every turn's tags before `splitTurns` cuts it, so a tag spoken between turns can't end up in a turn clip.
- **Native timestamps** are shifted back by the length of each cut; timings inside a cut collapse to its start.
- **Cost.** One transcription call per chunk that contains tags. Chunks without tags, and models that have tags stripped, make no call. A tagged request that will be checked is synthesized as PCM and comes back as WAV, like a chunked one, unless you pass `output` to choose another format.
- **Fails open.** A transcription, decoding, or splicing error returns the chunk unchanged and records `failed` in the report. Only an abort is rethrown. The check never fails or retries synthesis.
- **Report.** `metadata.spokenTags` is `{ checked, removedSeconds, spans, failed? }`, summed over chunks; each `metadata.chunks[i]` carries its own. Conversations sum over turns (see `metadata.perTurn`) or dialogue blocks. It is present when tags reached the model, or whenever you pass `spokenTagCheck`. Models without a decodable PCM/WAV mode skip the check with `failed` set.
- `streamSpeech` doesn't support it: streamed audio has already reached the caller before it could be checked.

A `TranscriptionProvider` is `transcribe({ audio, mediaType, abortSignal }) → { text, start, end }[]`, in seconds.

### Gemini 3.8 tags

Gemini 3.8 (`gemini-3.8-flash-tts`, `gemini-3.8-flash-lite-tts`) reads tags inline in angle brackets. The SDK converts every bracket tag to that form with your wording and case, trimmed of surrounding whitespace, and never rejects one: `[chuckles]` becomes `<chuckles>`, and `'Wait, [excited] that changes everything.'` becomes `'Wait, <excited> that changes everything.'`. Google's [recommended vocal tags](https://ai.google.dev/gemini-api/docs/speech-generation) include `<laugh>`, `<chuckle>`, `<sigh>`, `<breath>`, `<gasp>`, `<short pause>`, and `<long pause>`. Google recommends putting sustained emotion or delivery in `instructions`, which the SDK sends as the turn's `speech_metadata.style`.

Tags stay out of the timestamp transcript. If Gemini reads a tag aloud, alignment fails with `TimestampValidationError` (`transcript_mismatch`). Gemini 2.5 models strip every bracket tag with a warning; Gemini 3.1 receives bracket tags as written.

## Pronunciations

Customize how specific words are pronounced. Rules are applied as text substitution before the request is sent to the provider; word timestamps are inverse-mapped on return so the substitution is invisible to the caller.

```ts
import { generateSpeech } from '@speech-sdk/core';

await generateSpeech({
  model: 'openai/tts-1', // or createOpenAI()('tts-1')
  voice: 'alloy',
  text: 'What is LLM?',
  pronunciations: {
    rules: [{ word: 'LLM', replacement: 'el el em' }],
  },
});
```

The same option is available on `streamSpeech` and `generateConversation`. On `generateConversation`, the option applies globally to every turn.

`word` and `replacement` are trimmed at the ends before matching, so `'hello '` behaves exactly like `'hello'`; internal whitespace is preserved, so multi-word rules like `'New York'` keep matching. A rule whose `word` or `replacement` is empty after trimming is skipped — the remaining rules still apply.

A rule matches a standalone word: it can't touch a letter, digit or underscore on either side (so `cat` matches in `cat's` but not in `category` or `café`). Matching ignores case unless `caseSensitive: true`. Longer rules win and replaced text is never matched again, so with rules for `New York` and `York`, only `New York` applies to "I love New York". Rules with the same key (the word, lowercased unless `caseSensitive`) replace each other, and the last one listed wins; otherwise, when two rules of the same length match at the same spot, the one listed first wins. Audio tags are removed before matching, so a rule never applies inside a tag.

Rules can also be written as `{ word, respelling, ipa?, caseSensitive? }`. `respelling` is the spoken form and is trimmed and skipped when blank, exactly like `replacement`; the `{ word, replacement }` form keeps working unchanged and is treated as a respelling. Models that read IPA (today Gemini 3.8: `gemini-3.8-flash-tts`, `gemini-3.8-flash-lite-tts`) receive `ipa`; every other model receives `respelling`, as does any rule without `ipa`:

```ts
pronunciations: {
  rules: [{ word: 'gif', respelling: 'jif', ipa: 'dʒɪf' }],
}
```

To find out which rules apply to a line, and the exact replacement synthesis will send, call `resolvePronunciations`. It runs the same matching as synthesis, does no I/O, and returns each applied rule once, sorted by `ruleKey`:

```ts
import { resolvePronunciations } from '@speech-sdk/core/pronunciations';

const rules = [
  { word: 'New York', respelling: 'noo YORK', ipa: 'nuː ˈjɔːrk' },
  { word: 'York', respelling: 'YORK' },
];

resolvePronunciations('I love New York', rules, {
  provider: 'google',
  model: 'gemini-3.8-flash-tts', // optional; defaults to the provider's default model
});
// [{ ruleKey: 'new york', word: 'New York', caseSensitive: false, replacement: 'nuː ˈjɔːrk', form: 'ipa' }]
```

`resolvePronunciations` knows the SDK's built-in providers. For a custom provider whose models declare `FEATURES.IPA_PRONUNCIATION`, it reports the respelling while synthesis sends `ipa`.

Store the result with a voiced line; resolving again with the current rules and comparing tells you whether a rule change affects it.

## Voice cloning

Some providers support reference-audio cloning. Pass a voice object instead of a string.

```ts
import { createFal, createMistral } from '@speech-sdk/core/providers';

// Base64 reference:
await generateSpeech({
  model: createMistral()(),
  text: 'Hello!',
  voice: { audio: 'base64-encoded-audio...' },
});

// URL reference:
await generateSpeech({
  model: createFal()('fal-ai/f5-tts'),
  text: 'Hello!',
  voice: { url: 'https://example.com/reference.wav' },
});
```

## Voice design

`designVoice()` creates a brand-new synthetic voice from a text description (no
reference audio needed) and returns a reusable `voiceId` you can pass straight
to `generateSpeech()`. Pass a provider factory — design is a provider-level
operation, so no model id is required.

```ts
import { designVoice, generateSpeech } from '@speech-sdk/core';
import { createElevenLabs } from '@speech-sdk/core/providers';

const { voiceId, preview } = await designVoice({
  provider: createElevenLabs(),
  name: 'Narrator',
  description: 'A deep, warm, middle-aged British narrator, calm and authoritative',
  previewText: 'In the beginning, there was only silence.', // optional
});

await generateSpeech({
  model: createElevenLabs()('eleven_v3'),
  text: 'Now using my freshly designed voice.',
  voice: voiceId,
});
```

The SDK absorbs each provider's underlying flow (single-call, design→persist, or
design→clone) so you always get one reusable `voiceId` back, plus an optional
`preview` (`{ audio: Uint8Array, mediaType }`) of the designed voice.

Supported providers: ElevenLabs, MiniMax, Fal, Hume, Inworld, Resemble, Fish
Audio. Calling `designVoice()` with any other provider throws
`VoiceDesignUnsupportedError`.

> **Hume** references custom voices by name under the `CUSTOM_VOICE` namespace —
> when generating with a Hume-designed voice, pass
> `providerOptions: { voiceProvider: 'CUSTOM_VOICE' }` (the returned `warnings`
> remind you of this).

## Custom configuration

Factory functions give you custom API keys, base URLs, or `fetch` implementations:

```ts
import { generateSpeech } from '@speech-sdk/core';
import { createOpenAI } from '@speech-sdk/core/providers';

const myOpenAI = createOpenAI({
  apiKey: 'sk-...',
  baseURL: 'https://my-proxy.com/v1',
});

await generateSpeech({
  model: myOpenAI('gpt-4o-mini-tts'),
  text: 'Hello!',
  voice: 'alloy',
});
```

## Public imports

The root package exports the main runtime APIs:

```ts
import {
  generateSpeech,
  streamSpeech,
  generateConversation,
  timestampsToCaptions,
  ApiError,
  SpeechSdkProviderError,
} from '@speech-sdk/core';
```

Provider and STT factories live under `@speech-sdk/core/providers`:

```ts
import {
  createOpenAI,
  createElevenLabs,
  createCartesia,
  createGradium,
  createSpeechify,
} from '@speech-sdk/core/providers';
```

Public types live under `@speech-sdk/core/types`:

```ts
import type {
  GenerateSpeechOptions,
  SpeechResult,
  SpeechResultWithTimestamps,
  ConversationResult,
  ConversationResultWithTimestamps,
  TimestampProvider,
  Voice,
  WordTimestamp,
} from '@speech-sdk/core/types';
```

## API reference

```ts
generateSpeech({
  model: string | ResolvedModel,          // required
  text: string,                           // required — exact spoken transcript
  instructions?: string,                 // optional non-spoken delivery direction
  voice: Voice,                           // required — string | { url } | { audio }
  providerOptions?: object,
  volumeDbfs?: number,                    // ≤ 0
  timestamps?: boolean,
  timestampProvider?: TimestampProvider, // direct derivation or invalid-native fallback
  spokenTagCheck?: TranscriptionProvider | false, // automatic when tags reach the model; false turns it off
  maxRetries?: number,                    // default 2
  abortSignal?: AbortSignal,
  headers?: Record<string, string>,
}): Promise<SpeechResult>

interface SpeechResult {
  audio: { uint8Array: Uint8Array; base64: string; mediaType: string };
  metadata: { latencyMs: number; inputChars: number; provider: string; model: string; audioDurationMs?: number; ttfbMs?: number };
  timestamps?: WordTimestamp[];
  providerMetadata?: Record<string, unknown>;
  warnings?: string[];
}

interface TimestampProvider {
  align(input: {
    abortSignal?: AbortSignal;
    audio: Uint8Array;
    mediaType: string;
    text: string;
  }): Promise<readonly WordTimestamp[]>;
  // Optional: also used for the spoken-tag check.
  transcribe?(input: { abortSignal?: AbortSignal; audio: Uint8Array; mediaType: string }): Promise<readonly WordTimestamp[]>;
}

interface TranscriptionProvider {
  transcribe(input: {
    abortSignal?: AbortSignal;
    audio: Uint8Array;
    mediaType: string;
  }): Promise<readonly WordTimestamp[]>;
}

interface WordTimestamp { text: string; start: number; end: number }  // seconds

// Returned by generateConversation — extends WordTimestamp with turnIndex
interface ConversationWordTimestamp extends WordTimestamp {
  turnIndex: number;  // index into the input turns[] array
}
```

## Error handling

```ts
import { generateSpeech, SpeechSdkProviderError } from '@speech-sdk/core';

try {
  await generateSpeech({ /* ... */ });
} catch (error) {
  if (error instanceof SpeechSdkProviderError) {
    error.status;        // 401, 429, 500, ...
    error.provider;      // google
    error.model;         // gemini-3.1-flash-tts-preview
    error.code;          // INVALID_ARGUMENT (optional)
    error.details;       // complete parsed provider response body
    error.rawResponse;   // complete response text
    error.requestId;     // provider request ID (optional)
    error.retryable;
    error.stage;         // synthesis | alignment (optional)
    JSON.stringify(error);
  }
}
```

A 200 response with no audio, a provider declining to voice the text, and text that holds no words all surface as `NoSpeechGeneratedError`. Only the first recovers on a retry, so the error carries its classification:

```ts
if (error instanceof NoSpeechGeneratedError) {
  error.reason;      // provider_empty_response | content_refusal | empty_input
  error.retryable;   // true only for provider_empty_response
  error.provider;    // elevenlabs (optional)
  error.model;       // eleven_v3 (optional)
  error.requestId;   // provider request ID, for support (optional)
  error.turnIndex;   // which conversation turn (optional)
}
```

Callers deciding whether to re-attempt should read `retryable` rather than treating the class as terminal: an ElevenLabs `/with-timestamps` response carrying alignment and no `audio_base64` is a transient provider defect that a plain retry recovers, while a Gemini `SAFETY` decline and wordless input repeat identically forever. The SDK applies the same rule to its own retries.

`SpeechSdkProviderError` extends `ApiError`, so existing `instanceof ApiError`, `statusCode`, and `responseBody` handling remains compatible. `code` is populated from provider error codes (including Google `error.status`) or the RFC 7807 `code` extension. Match on `code` over `message` text — codes are a stable contract, messages aren't.

ElevenLabs Terms-of-Service content blocks use the canonical code `content_policy` with `retryable: false`. App callers should map that code to their content-refusal UX (for example, `content_refused` with guidance to edit the wording or switch hosts). The original ElevenLabs `type` and `code` remain available in `details`; string matching is only a compatibility fallback for older SDK versions.

| Error | When |
|---|---|
| `SpeechSdkProviderError` | Provider returned non-2xx; includes the parsed and raw provider response |
| `ApiError` | Backward-compatible base class for API failures |
| `MissingApiKeyError` | No `apiKey` passed and the provider's env var is unset |
| `NoSpeechGeneratedError` | Empty input (after tag stripping), a provider declining to voice the text, or an empty provider response — `reason` says which |
| `StreamingNotSupportedError` | `streamSpeech()` on a non-streaming model |
| `VolumeAdjustmentUnsupportedError` | `volumeDbfs` with no decodable output mode |
| `TimestampProviderRequiredError` | `timestamps: true` on a direct model without native timestamps or an explicit timestamp provider |
| `TimestampValidationError` | Requested timestamps are empty, structurally invalid, or do not exactly cover the synthesized text |
| `TimestampKeyMissingError` | A legacy configured `fallbackSTT` is missing its API key |
| `ConversationInputError` / `DialogueConstraintError` / `StitchUnsupportedError` | `generateConversation` validation / native caps / stitch incompatibility |
| `TurnSplitError` | `splitTurns: true` but turn boundaries can't be trusted or the audio can't be decoded — `reason` says which |
| `InstructionsUnsupportedError` | Non-empty delivery instructions were supplied to a direct model without the `instructions` capability |
| `SpeechSDKError` | Base class |

Retries 5xx (except 501), 429, `NoSpeechGeneratedError` with `retryable: true`, and network errors with jittered exponential backoff ([p-retry](https://github.com/sindresorhus/p-retry)); other 4xx and 501 are terminal. `SpeechSdkProviderError.retryable` exposes that HTTP classification. When a retriable error carries a `Retry-After` header, the SDK sleeps that long before the next attempt — capped at 60s to avoid pathological waits. The parsed value is surfaced as `retryAfterMs` whenever the header is present, even on terminal errors that aren't retried. Default 2 retries; override via `maxRetries`.

## Development

```bash
pnpm install
pnpm test              # unit tests
pnpm run test:e2e      # e2e tests (requires provider API keys)
pnpm run typecheck
pnpm fix               # format + lint
```

E2E tests hit real provider APIs. Set the relevant keys in `.env` or export them. Set `SPEECH_SDK_E2E_OUTPUT_DIR=~/Downloads/convos` to write conversation e2e audio to disk.
