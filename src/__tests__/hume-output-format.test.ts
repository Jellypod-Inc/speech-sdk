import { describe, expect, it } from "vitest";
import { HumeSpeechProvider } from "../providers/hume/index.js";

describe("HumeSpeechProvider.resolveOutputFormat", () => {
  const provider = new HumeSpeechProvider({ apiKey: "test" });
  const modelId = provider.defaultModel;

  it("requests wav natively when user wants wav", () => {
    const result = provider.resolveOutputFormat(modelId, { format: "wav" });
    expect(result).toEqual({
      providerOptions: { format: { type: "wav" } },
      expectedMediaType: "audio/wav",
    });
  });

  it("requests mp3 natively when user wants mp3", () => {
    const result = provider.resolveOutputFormat(modelId, { format: "mp3" });
    expect(result).toEqual({
      providerOptions: { format: { type: "mp3" } },
      expectedMediaType: "audio/mpeg",
    });
  });

  it("requests pcm natively when user wants pcm (48kHz mono)", () => {
    const result = provider.resolveOutputFormat(modelId, { format: "pcm" });
    expect(result).toEqual({
      providerOptions: { format: { type: "pcm" } },
      expectedMediaType: "audio/pcm;rate=48000",
    });
  });

  it("returns undefined for unknown model id", () => {
    expect(
      provider.resolveOutputFormat("does-not-exist", { format: "wav" })
    ).toBeUndefined();
  });
});
