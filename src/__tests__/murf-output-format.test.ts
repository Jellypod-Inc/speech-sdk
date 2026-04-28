import { describe, expect, it } from "vitest";
import { MurfSpeechProvider } from "../providers/murf/index.js";

describe("MurfSpeechProvider.resolveOutputFormat", () => {
  const provider = new MurfSpeechProvider({ apiKey: "test" });

  it("requests WAV natively when user wants wav", () => {
    const result = provider.resolveOutputFormat?.("GEN2", { format: "wav" });
    expect(result).toEqual({
      providerOptions: { format: "WAV", sampleRate: 24_000 },
      expectedMediaType: "audio/wav",
    });
  });

  it("requests MP3 natively when user wants mp3", () => {
    const result = provider.resolveOutputFormat?.("GEN2", { format: "mp3" });
    expect(result).toEqual({
      providerOptions: { format: "MP3", sampleRate: 24_000 },
      expectedMediaType: "audio/mpeg",
    });
  });

  it("requests PCM natively when user wants pcm", () => {
    const result = provider.resolveOutputFormat?.("GEN2", { format: "pcm" });
    expect(result).toEqual({
      providerOptions: { format: "PCM", sampleRate: 24_000 },
      expectedMediaType: "audio/pcm;rate=24000",
    });
  });

  it("resolves natively for FALCON model", () => {
    const result = provider.resolveOutputFormat?.("FALCON", { format: "mp3" });
    expect(result).toEqual({
      providerOptions: { format: "MP3", sampleRate: 24_000 },
      expectedMediaType: "audio/mpeg",
    });
  });

  it("returns undefined for unknown model id", () => {
    expect(
      provider.resolveOutputFormat?.("does-not-exist", { format: "wav" })
    ).toBeUndefined();
  });
});
