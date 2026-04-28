import { describe, expect, it } from "vitest";
import type { AudioOutputFormat } from "../audio-output.js";
import { CartesiaSpeechProvider } from "../providers/cartesia/index.js";
import { DeepgramSpeechProvider } from "../providers/deepgram/index.js";
import { ElevenLabsSpeechProvider } from "../providers/elevenlabs/index.js";
import { FalSpeechProvider } from "../providers/fal/index.js";
import { FishAudioSpeechProvider } from "../providers/fish-audio/index.js";
import { GoogleSpeechProvider } from "../providers/google/index.js";
import { HumeSpeechProvider } from "../providers/hume/index.js";
import { InworldSpeechProvider } from "../providers/inworld/index.js";
import { MistralSpeechProvider } from "../providers/mistral/index.js";
import { MurfSpeechProvider } from "../providers/murf/index.js";
import { OpenAISpeechProvider } from "../providers/openai/index.js";
import { ResembleSpeechProvider } from "../providers/resemble/index.js";
import { XaiSpeechProvider } from "../providers/xai/index.js";
import type { SpeechProvider } from "../speech-provider.js";

const DECODABLE_MEDIA_TYPES = /^audio\/(wav|mpeg|pcm)/;
const FORMATS: AudioOutputFormat[] = ["wav", "mp3", "pcm"];

const providers: { name: string; provider: SpeechProvider }[] = [
  { name: "openai", provider: new OpenAISpeechProvider({ apiKey: "test" }) },
  {
    name: "elevenlabs",
    provider: new ElevenLabsSpeechProvider({ apiKey: "test" }),
  },
  {
    name: "cartesia",
    provider: new CartesiaSpeechProvider({ apiKey: "test" }),
  },
  { name: "mistral", provider: new MistralSpeechProvider({ apiKey: "test" }) },
  { name: "xai", provider: new XaiSpeechProvider({ apiKey: "test" }) },
  { name: "hume", provider: new HumeSpeechProvider({ apiKey: "test" }) },
  { name: "fal", provider: new FalSpeechProvider({ apiKey: "test" }) },
  {
    name: "fish-audio",
    provider: new FishAudioSpeechProvider({ apiKey: "test" }),
  },
  { name: "inworld", provider: new InworldSpeechProvider({ apiKey: "test" }) },
  {
    name: "deepgram",
    provider: new DeepgramSpeechProvider({ apiKey: "test" }),
  },
  {
    name: "resemble",
    provider: new ResembleSpeechProvider({ apiKey: "test" }),
  },
  { name: "murf", provider: new MurfSpeechProvider({ apiKey: "test" }) },
  { name: "google", provider: new GoogleSpeechProvider({ apiKey: "test" }) },
];

// fal accepts arbitrary path-style model IDs and serves WAV for all of them.
const FAL_NAME = "fal";

describe("SpeechProvider.resolveOutputFormat contract", () => {
  for (const { name, provider } of providers) {
    if (name !== FAL_NAME) {
      it(`${name} returns undefined for unknown model id`, () => {
        const result = provider.resolveOutputFormat?.("does-not-exist", {
          format: "wav",
        });
        expect(result).toBeUndefined();
      });
    }

    for (const format of FORMATS) {
      it(`${name} returns a decodable expectedMediaType for format=${format}`, () => {
        const result = provider.resolveOutputFormat?.(provider.defaultModel, {
          format,
        });
        // A provider may legitimately return undefined if it cannot natively
        // produce the requested format AND has no decodable fallback. In that
        // case the dispatcher in generate-speech.ts falls back to getStitchOptions
        // or throws OutputConversionUnsupportedError — covered separately.
        if (result === undefined) {
          return;
        }
        expect(result.expectedMediaType).toMatch(DECODABLE_MEDIA_TYPES);
        expect(result.providerOptions).toBeTypeOf("object");
      });
    }
  }
});
