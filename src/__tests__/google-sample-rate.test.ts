import { describe, expect, it } from "vitest";
import { UnsupportedSampleRateError } from "../errors.js";
import { GoogleSpeechProvider } from "../providers/google/index.js";

const provider = new GoogleSpeechProvider({ apiKey: "test" });
const MODEL = provider.defaultModel;

describe("Google sample rates", () => {
  it("publishes only 24000", () => {
    expect(provider.supportedSampleRates(MODEL)).toEqual([24_000]);
  });

  it("accepts an explicit 24000 hint", () => {
    expect(provider.getStitchOptions(MODEL, { sampleRate: 24_000 })).toEqual({
      providerOptions: {},
      mediaType: "audio/wav",
    });
  });

  it("throws when caller requests an unsupported rate from getStitchOptions", () => {
    expect(() =>
      provider.getStitchOptions(MODEL, { sampleRate: 48_000 })
    ).toThrow(UnsupportedSampleRateError);
  });

  it("throws when caller requests an unsupported rate from resolveOutputFormat", () => {
    expect(() =>
      provider.resolveOutputFormat(MODEL, { format: "wav", sampleRate: 48_000 })
    ).toThrow(UnsupportedSampleRateError);
  });
});
