import { describe, expect, it } from "vitest";
import { UnsupportedSampleRateError } from "../errors.js";
import { HumeSpeechProvider } from "../providers/hume/index.js";

const provider = new HumeSpeechProvider({ apiKey: "test" });
const MODEL = provider.defaultModel;

describe("Hume sample rates", () => {
  it("publishes only 48000", () => {
    expect(provider.supportedSampleRates(MODEL)).toEqual([48_000]);
  });

  it("accepts an explicit 48000 hint", () => {
    expect(provider.getStitchOptions(MODEL, { sampleRate: 48_000 })).toEqual({
      providerOptions: { format: { type: "pcm" } },
      mediaType: "audio/pcm;rate=48000",
    });
  });

  it("throws when caller requests an unsupported rate from getStitchOptions", () => {
    expect(() =>
      provider.getStitchOptions(MODEL, { sampleRate: 24_000 })
    ).toThrow(UnsupportedSampleRateError);
  });

  it("throws when caller requests an unsupported rate from resolveOutputFormat", () => {
    expect(() =>
      provider.resolveOutputFormat(MODEL, { format: "wav", sampleRate: 24_000 })
    ).toThrow(UnsupportedSampleRateError);
  });
});
