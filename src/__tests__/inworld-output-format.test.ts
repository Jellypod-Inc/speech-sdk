import { describe, expect, it } from "vitest";
import { InworldSpeechProvider } from "../providers/inworld/index.js";

describe("InworldSpeechProvider.resolveOutputFormat", () => {
  const provider = new InworldSpeechProvider({ apiKey: "test" });
  const modelId = provider.defaultModel;

  it("requests LINEAR16 natively when user wants wav", () => {
    const result = provider.resolveOutputFormat?.(modelId, { format: "wav" });
    expect(result).toEqual({
      providerOptions: {
        audio_config: {
          audio_encoding: "LINEAR16",
          sample_rate_hertz: 24_000,
        },
      },
      expectedMediaType: "audio/wav",
    });
  });

  it("requests MP3 natively when user wants mp3", () => {
    const result = provider.resolveOutputFormat?.(modelId, { format: "mp3" });
    expect(result).toEqual({
      providerOptions: {
        audio_config: {
          audio_encoding: "MP3",
          sample_rate_hertz: 48_000,
        },
      },
      expectedMediaType: "audio/mpeg",
    });
  });

  it("falls back to LINEAR16 (wav) when user wants pcm; SDK unwraps to pcm", () => {
    const result = provider.resolveOutputFormat?.(modelId, { format: "pcm" });
    expect(result).toEqual({
      providerOptions: {
        audio_config: {
          audio_encoding: "LINEAR16",
          sample_rate_hertz: 24_000,
        },
      },
      expectedMediaType: "audio/wav",
    });
  });

  it("returns undefined for unknown model id", () => {
    expect(
      provider.resolveOutputFormat?.("does-not-exist", { format: "wav" })
    ).toBeUndefined();
  });
});
