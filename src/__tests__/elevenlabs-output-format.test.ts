import { describe, expect, it } from "vitest";
import { ElevenLabsSpeechProvider } from "../providers/elevenlabs/index.js";

describe("ElevenLabsSpeechProvider.resolveOutputFormat", () => {
  const provider = new ElevenLabsSpeechProvider({ apiKey: "test" });
  const modelId = provider.defaultModel;

  it("requests pcm_24000 when user wants pcm; SDK gets the rate it expects", () => {
    const result = provider.resolveOutputFormat(modelId, { format: "pcm" });
    expect(result).toEqual({
      providerOptions: { output_format: "pcm_24000" },
      expectedMediaType: "audio/pcm;rate=24000",
    });
  });

  it("requests mp3_44100_128 when user wants mp3 (default bitrate)", () => {
    const result = provider.resolveOutputFormat(modelId, {
      format: "mp3",
      bitrate: 128,
    });
    expect(result?.providerOptions.output_format).toBe("mp3_44100_128");
    expect(result?.expectedMediaType).toBe("audio/mpeg");
  });

  it("falls back to pcm_24000 when user wants wav (no native wav)", () => {
    const result = provider.resolveOutputFormat(modelId, { format: "wav" });
    expect(result).toEqual({
      providerOptions: { output_format: "pcm_24000" },
      expectedMediaType: "audio/pcm;rate=24000",
    });
  });
});
