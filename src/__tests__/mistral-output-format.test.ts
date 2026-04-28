import { describe, expect, it } from "vitest";
import { MistralSpeechProvider } from "../providers/mistral/index.js";

describe("MistralSpeechProvider.resolveOutputFormat", () => {
  const provider = new MistralSpeechProvider({ apiKey: "test" });
  const modelId = provider.defaultModel;

  it("requests pcm natively when user wants pcm", () => {
    const result = provider.resolveOutputFormat(modelId, { format: "pcm" });
    expect(result).toEqual({
      providerOptions: { response_format: "pcm" },
      expectedMediaType: "audio/pcm;rate=24000",
    });
  });

  it("requests mp3 natively when user wants mp3", () => {
    const result = provider.resolveOutputFormat(modelId, { format: "mp3" });
    expect(result).toEqual({
      providerOptions: { response_format: "mp3" },
      expectedMediaType: "audio/mpeg",
    });
  });

  it("requests pcm when user wants wav (no native wav; SDK wraps)", () => {
    const result = provider.resolveOutputFormat(modelId, { format: "wav" });
    expect(result).toEqual({
      providerOptions: { response_format: "pcm" },
      expectedMediaType: "audio/pcm;rate=24000",
    });
  });
});
