import { describe, expect, it } from "vitest";
import { CartesiaSpeechProvider } from "../providers/cartesia/index.js";

describe("CartesiaSpeechProvider.resolveOutputFormat", () => {
  const provider = new CartesiaSpeechProvider({ apiKey: "test" });
  const modelId = provider.defaultModel;

  it("requests wav container natively when user wants wav", () => {
    const result = provider.resolveOutputFormat(modelId, { format: "wav" });
    expect(result?.providerOptions).toMatchObject({
      output_format: {
        container: "wav",
        encoding: "pcm_s16le",
        sample_rate: 24_000,
      },
    });
    expect(result?.expectedMediaType).toBe("audio/wav");
  });

  it("requests raw pcm_s16le when user wants pcm", () => {
    const result = provider.resolveOutputFormat(modelId, { format: "pcm" });
    expect(result?.providerOptions).toMatchObject({
      output_format: {
        container: "raw",
        encoding: "pcm_s16le",
        sample_rate: 24_000,
      },
    });
    expect(result?.expectedMediaType).toBe("audio/pcm;rate=24000");
  });

  it("falls back to raw pcm when user wants mp3 (no native mp3)", () => {
    const result = provider.resolveOutputFormat(modelId, { format: "mp3" });
    expect(result?.providerOptions).toMatchObject({
      output_format: {
        container: "raw",
        encoding: "pcm_s16le",
        sample_rate: 24_000,
      },
    });
    expect(result?.expectedMediaType).toBe("audio/pcm;rate=24000");
  });
});
