# AssemblyAI

| | |
| --- | --- |
| Prefix | `assemblyai` |
| Default model | `assemblyai-tts-1` |
| Env var | `ASSEMBLYAI_API_KEY` |
| Official docs | https://www.assemblyai.com/docs/tts |

## Models

| Model              | Streaming | Audio Tags | Voice Cloning | Notes                                              |
| ------------------ | --------- | ---------- | ------------- | -------------------------------------------------- |
| `assemblyai-tts-1` | No        | No         | No            | English, Spanish, German, Italian, Portuguese, French; `maxInputChars: 5000` |

## Usage

```ts
await generateSpeech({
  model: "assemblyai/assemblyai-tts-1",
  text: "Hi, thanks for calling.",
  voice: "aai-kyla",
})
```

`voice` is sent as `voice_id`: a library slug such as `aai-kyla` or `aai-donatien`, or the slug of a voice you cloned in the AssemblyAI dashboard. Without `voice`, AssemblyAI picks its default voice for the language. There is no API to list voices; browse them in the dashboard.

The SDK requests a buffered 16-bit WAV (up to 48 kHz), so output conversion and conversation stitching work. `mp3` output is requested natively. Bracket tags such as `[laughs]` are stripped with a warning, because AssemblyAI would read them aloud; steer delivery with punctuation instead. AssemblyAI has no native speed parameter, so `speed` is applied by the SDK's time-stretch step.

## Provider Options

Merged into the JSON body of `POST /v1/speech`:

```ts
await generateSpeech({
  model: "assemblyai/assemblyai-tts-1",
  text: "Hola, gracias por llamar.",
  voice: "aai-antonioluis",
  providerOptions: { language: "spanish" },
})
```

## Factory

```ts
import { createAssemblyAI } from "@speech-sdk/core/providers"
const assemblyai = createAssemblyAI({ baseURL: "https://tts.eu.assemblyai.com" })
await generateSpeech({ model: assemblyai(), text: "...", voice: "aai-kyla" })
```

Use the EU base URL to keep data in the EU zone; cloned voices only work in the zone they were created in.
