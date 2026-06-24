import { describe, expect, it } from "vitest";
import type { SpeechProvider } from "../speech-provider.js";

describe("SpeechProvider dialogue/stitch extensions", () => {
  it("allows a provider to implement generateDialogue", () => {
    const provider: SpeechProvider = {
      id: "mock",
      defaultModel: "m",
      models: [],
      generate: async () => ({
        audio: new Uint8Array(),
        mediaType: "audio/wav",
      }),
      generateDialogue: async () => ({
        audio: new Uint8Array([1, 2, 3]),
        mediaType: "audio/wav",
      }),
      dialogueCapabilities: () => ({ maxVoices: 2 }),
    };
    expect(provider.generateDialogue).toBeDefined();
    expect(provider.dialogueCapabilities?.("m")).toEqual({
      maxVoices: 2,
    });
  });

  it("allows a provider to implement getStitchOptions", () => {
    const provider: SpeechProvider = {
      id: "mock",
      defaultModel: "m",
      models: [],
      generate: async () => ({
        audio: new Uint8Array(),
        mediaType: "audio/wav",
      }),
      getStitchOptions: () => ({
        providerOptions: { response_format: "pcm" },
        mediaType: "audio/pcm;rate=24000",
      }),
    };
    expect(provider.getStitchOptions?.("m")).toEqual({
      providerOptions: { response_format: "pcm" },
      mediaType: "audio/pcm;rate=24000",
    });
  });
});
