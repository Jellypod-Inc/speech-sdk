# Microsoft (MAI-Voice on Azure Speech)

| | |
| --- | --- |
| Prefix | `microsoft` |
| Default model | `mai-voice-2.1-flash` |
| Env vars | `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` |
| Official docs | https://learn.microsoft.com/azure/ai-services/speech-service/mai-voices |

MAI-Voice is in public preview on Azure Speech, without an SLA.

## Models

| Model                 | Streaming | Audio Tags | Voice Cloning | Notes                              |
| --------------------- | --------- | ---------- | ------------- | ---------------------------------- |
| `mai-voice-2.1-flash` | No        | No         | No            | Default; low latency, 23 languages |
| `mai-voice-2.1`       | No        | No         | No            | Highest fidelity, 23 languages     |

## Usage

```ts
await generateSpeech({
  model: "microsoft/mai-voice-2.1",
  text: "Hello!",
  voice: "en-US-Harper",
})
```

Pass a voice id from Microsoft's MAI voice table (`en-US-Harper`, `en-GB-Emily`, `es-MX-Valeria`, `zh-CN-Mei`, …); the SDK adds the model suffix (`en-US-Harper:MAI-Voice-2.1`) and sets the SSML language from the voice's locale. A voice that already contains `:` is sent unchanged. The default voice is `en-US-Harper`.

The text is XML-escaped into an SSML document, so SSML inside `text` is spoken literally. Bracket tags such as `[laughs]` are stripped with a warning.

The SDK asks Azure for 16-bit WAV at 24 kHz, the voices' native rate, so output conversion and conversation stitching work; WAV at 8–48 kHz and MP3 at 16, 24 or 48 kHz can be requested with `output`.

## Provider Options

| Option        | Effect                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------- |
| `style`       | Wraps the text in `<mstts:express-as style="…">`. Each voice lists its styles, e.g. `joyful`, `narrator`, `customer_call_center`. |
| `styleDegree` | Sets `styledegree` on the style.                                                          |
| `outputFormat`| Any Azure Speech `X-Microsoft-OutputFormat` value; overrides the SDK's choice.            |

```ts
await generateSpeech({
  model: "microsoft/mai-voice-2.1-flash",
  text: "We did it!",
  voice: "en-US-Harper",
  providerOptions: { style: "joyful" },
})
```

## Factory

```ts
import { createMicrosoft } from "@speech-sdk/core/providers"
const microsoft = createMicrosoft({ region: "eastus" })
await generateSpeech({ model: microsoft("mai-voice-2.1"), text: "...", voice: "en-US-Harper" })
```

`apiKey` is the Speech resource key. For a resource with a custom domain, pass `baseURL: "https://<resource>.cognitiveservices.azure.com"` instead of `region`.
