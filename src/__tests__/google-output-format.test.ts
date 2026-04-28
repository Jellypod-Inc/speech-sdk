import { describe, expect, it } from "vitest";
import { GoogleSpeechProvider } from "../providers/google/index.js";

describe("GoogleSpeechProvider.resolveOutputFormat", () => {
  const provider = new GoogleSpeechProvider({ apiKey: "test" });
  const modelId = provider.defaultModel;

  // Gemini TTS always returns 24kHz s16 PCM that the provider wraps as WAV before
  // handing back. The endpoint doesn't accept a format parameter, so we declare
  // wav as the expected mediaType for every request and let the SDK's pass-through
  // / mediabunny path handle pcm and mp3 conversions.

  it("declares wav output natively for wav requests", () => {
    const result = provider.resolveOutputFormat(modelId, { format: "wav" });
    expect(result).toEqual({
      providerOptions: {},
      expectedMediaType: "audio/wav",
    });
  });

  it("declares wav for pcm requests; SDK unwraps to pcm via mediabunny", () => {
    const result = provider.resolveOutputFormat(modelId, { format: "pcm" });
    expect(result).toEqual({
      providerOptions: {},
      expectedMediaType: "audio/wav",
    });
  });

  it("declares wav for mp3 requests; SDK encodes mp3 via mediabunny", () => {
    const result = provider.resolveOutputFormat(modelId, { format: "mp3" });
    expect(result).toEqual({
      providerOptions: {},
      expectedMediaType: "audio/wav",
    });
  });

  it("returns undefined for unknown model id", () => {
    expect(
      provider.resolveOutputFormat("does-not-exist", { format: "wav" })
    ).toBeUndefined();
  });
});
