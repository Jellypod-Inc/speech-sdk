import { describe, expect, it } from "vitest";
import { FishAudioSpeechProvider } from "../providers/fish-audio/index.js";

describe("FishAudioSpeechProvider.resolveOutputFormat", () => {
  const provider = new FishAudioSpeechProvider({ apiKey: "test" });
  const modelId = provider.defaultModel;

  it("requests wav natively when user wants wav", () => {
    const result = provider.resolveOutputFormat(modelId, { format: "wav" });
    expect(result).toEqual({
      providerOptions: { format: "wav" },
      expectedMediaType: "audio/wav",
    });
  });

  it("requests mp3 natively when user wants mp3", () => {
    const result = provider.resolveOutputFormat(modelId, { format: "mp3" });
    expect(result).toEqual({
      providerOptions: { format: "mp3" },
      expectedMediaType: "audio/mpeg",
    });
  });

  it("falls back to wav when user wants pcm (no native pcm)", () => {
    const result = provider.resolveOutputFormat(modelId, { format: "pcm" });
    expect(result).toEqual({
      providerOptions: { format: "wav" },
      expectedMediaType: "audio/wav",
    });
  });

  it("returns undefined for unknown model id", () => {
    expect(
      provider.resolveOutputFormat("does-not-exist", { format: "wav" })
    ).toBeUndefined();
  });
});
