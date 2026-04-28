import { describe, expect, it } from "vitest";
import { ResembleSpeechProvider } from "../providers/resemble/index.js";

describe("ResembleSpeechProvider.resolveOutputFormat", () => {
  const provider = new ResembleSpeechProvider({ apiKey: "test" });
  const modelId = provider.defaultModel;

  it("requests wav natively when user wants wav (pinned to PCM_16)", () => {
    const result = provider.resolveOutputFormat(modelId, { format: "wav" });
    expect(result).toEqual({
      providerOptions: { output_format: "wav", precision: "PCM_16" },
      expectedMediaType: "audio/wav",
    });
  });

  it("requests mp3 natively when user wants mp3", () => {
    const result = provider.resolveOutputFormat(modelId, { format: "mp3" });
    expect(result).toEqual({
      providerOptions: { output_format: "mp3" },
      expectedMediaType: "audio/mpeg",
    });
  });

  it("falls back to wav (PCM_16) when user wants pcm (no native pcm container)", () => {
    const result = provider.resolveOutputFormat(modelId, { format: "pcm" });
    expect(result).toEqual({
      providerOptions: { output_format: "wav", precision: "PCM_16" },
      expectedMediaType: "audio/wav",
    });
  });

  it("returns undefined for unknown model id", () => {
    expect(
      provider.resolveOutputFormat("does-not-exist", { format: "wav" })
    ).toBeUndefined();
  });
});
