import { describe, expect, it } from "vitest";
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
import { hasFeature, type SpeechProvider } from "../speech-provider.js";

const streamingProviders: SpeechProvider[] = [
  new OpenAISpeechProvider({}),
  new ElevenLabsSpeechProvider({}),
  new DeepgramSpeechProvider({}),
  new CartesiaSpeechProvider({}),
  new HumeSpeechProvider({}),
  new InworldSpeechProvider({}),
  new FishAudioSpeechProvider({}),
  new ResembleSpeechProvider({}),
  new MurfSpeechProvider({}),
  new MistralSpeechProvider({}),
  new GoogleSpeechProvider({}),
];

describe("ModelInfo streaming feature", () => {
  for (const provider of streamingProviders) {
    it(`${provider.id}: every model has the streaming feature`, () => {
      for (const model of provider.models) {
        expect(hasFeature(model, "streaming")).toBe(true);
      }
    });
  }

  it("fal-ai: no model has the streaming feature", () => {
    const fal = new FalSpeechProvider({});
    for (const model of fal.models) {
      expect(hasFeature(model, "streaming")).toBe(false);
    }
  });
});
