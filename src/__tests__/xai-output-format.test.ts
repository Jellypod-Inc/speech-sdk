import { describe, expect, it } from "vitest";
import { XaiSpeechProvider } from "../providers/xai/index.js";

describe("XaiSpeechProvider.resolveOutputFormat", () => {
  const provider = new XaiSpeechProvider({ apiKey: "test" });
  const modelId = provider.defaultModel;

  it("requests wav natively when user wants wav", () => {
    const result = provider.resolveOutputFormat(modelId, { format: "wav" });
    expect(result).toEqual({
      providerOptions: { output_format: { codec: "wav" } },
      expectedMediaType: "audio/wav",
    });
  });

  it("requests mp3 natively when user wants mp3", () => {
    const result = provider.resolveOutputFormat(modelId, { format: "mp3" });
    expect(result).toEqual({
      providerOptions: { output_format: { codec: "mp3" } },
      expectedMediaType: "audio/mpeg",
    });
  });

  it("requests pcm natively when user wants pcm (24kHz mono)", () => {
    const result = provider.resolveOutputFormat(modelId, { format: "pcm" });
    expect(result).toEqual({
      providerOptions: {
        output_format: { codec: "pcm", sample_rate: 24_000 },
      },
      expectedMediaType: "audio/pcm;rate=24000",
    });
  });

  it("returns undefined for unknown model id", () => {
    expect(
      provider.resolveOutputFormat("does-not-exist", { format: "wav" })
    ).toBeUndefined();
  });
});
