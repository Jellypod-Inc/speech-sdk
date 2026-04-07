import { describe, expect, it } from "vitest";
import { CartesiaSpeechProvider } from "../providers/cartesia/index.js";
import { DeepgramSpeechProvider } from "../providers/deepgram/index.js";
import { ElevenLabsSpeechProvider } from "../providers/elevenlabs/index.js";
import { FalSpeechProvider } from "../providers/fal/index.js";
import { FishAudioSpeechProvider } from "../providers/fish-audio/index.js";
import { GoogleSpeechProvider } from "../providers/google/index.js";
import { HumeSpeechProvider } from "../providers/hume/index.js";
import { MistralSpeechProvider } from "../providers/mistral/index.js";
import { MurfSpeechProvider } from "../providers/murf/index.js";
import { OpenAISpeechProvider } from "../providers/openai/index.js";
import { ResembleSpeechProvider } from "../providers/resemble/index.js";
import { UnrealSpeechProvider } from "../providers/unreal-speech/index.js";
import type { SpeechProvider } from "../speech-provider.js";

const streamingProviders: SpeechProvider[] = [
  new OpenAISpeechProvider({}),
  new ElevenLabsSpeechProvider({}),
  new DeepgramSpeechProvider({}),
  new CartesiaSpeechProvider({}),
  new HumeSpeechProvider({}),
  new FishAudioSpeechProvider({}),
  new ResembleSpeechProvider({}),
  new MurfSpeechProvider({}),
  new UnrealSpeechProvider({}),
  new MistralSpeechProvider({}),
  new GoogleSpeechProvider({}),
];

describe("ModelInfo.streaming", () => {
  for (const provider of streamingProviders) {
    it(`${provider.id}: every model has streaming: true`, () => {
      for (const model of provider.models) {
        expect(model.streaming).toBe(true);
      }
    });
  }

  it("fal-ai: every model has streaming: false", () => {
    const fal = new FalSpeechProvider({});
    for (const model of fal.models) {
      expect(model.streaming).toBe(false);
    }
  });
});
