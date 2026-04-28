import { describe, expect, it } from "vitest";
import { OpenAISpeechProvider } from "../providers/openai/index.js";

describe("OpenAISpeechProvider.resolveOutputFormat", () => {
  const provider = new OpenAISpeechProvider({ apiKey: "test" });

  it("requests wav natively when user wants wav", () => {
    const result = provider.resolveOutputFormat("tts-1", { format: "wav" });
    expect(result).toEqual({
      providerOptions: { response_format: "wav" },
      expectedMediaType: "audio/wav",
    });
  });

  it("requests mp3 natively when user wants mp3", () => {
    const result = provider.resolveOutputFormat("tts-1", { format: "mp3" });
    expect(result).toEqual({
      providerOptions: { response_format: "mp3" },
      expectedMediaType: "audio/mpeg",
    });
  });

  it("requests pcm natively when user wants pcm (24kHz mono)", () => {
    const result = provider.resolveOutputFormat("tts-1", { format: "pcm" });
    expect(result).toEqual({
      providerOptions: { response_format: "pcm" },
      expectedMediaType: "audio/pcm;rate=24000",
    });
  });

  it("returns undefined for unknown model id", () => {
    expect(
      provider.resolveOutputFormat("does-not-exist", { format: "wav" })
    ).toBeUndefined();
  });
});
