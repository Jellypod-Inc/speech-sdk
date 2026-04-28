import { describe, expect, it } from "vitest";
import { DeepgramSpeechProvider } from "../providers/deepgram/index.js";

describe("DeepgramSpeechProvider.resolveOutputFormat", () => {
  const provider = new DeepgramSpeechProvider({ apiKey: "test" });
  const modelId = provider.defaultModel;

  it("requests linear16 + wav container natively when user wants wav", () => {
    const result = provider.resolveOutputFormat(modelId, { format: "wav" });
    expect(result).toEqual({
      providerOptions: {
        encoding: "linear16",
        container: "wav",
        sample_rate: 24_000,
      },
      expectedMediaType: "audio/wav",
    });
  });

  it("requests linear16 + none container when user wants pcm", () => {
    const result = provider.resolveOutputFormat(modelId, { format: "pcm" });
    expect(result).toEqual({
      providerOptions: {
        encoding: "linear16",
        container: "none",
        sample_rate: 24_000,
      },
      expectedMediaType: "audio/pcm;rate=24000",
    });
  });

  it("requests mp3 encoding natively when user wants mp3", () => {
    const result = provider.resolveOutputFormat(modelId, { format: "mp3" });
    expect(result).toEqual({
      providerOptions: { encoding: "mp3" },
      expectedMediaType: "audio/mpeg",
    });
  });

  it("returns undefined for unknown model id", () => {
    expect(
      provider.resolveOutputFormat("does-not-exist", { format: "wav" })
    ).toBeUndefined();
  });
});
