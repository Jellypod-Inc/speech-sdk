import { describe, expect, it } from "vitest";
import { UnsupportedSampleRateError } from "../errors.js";
import { SmallestAISpeechProvider } from "../providers/smallest-ai/index.js";

const provider = new SmallestAISpeechProvider({ apiKey: "test" });
const MODEL = provider.defaultModel;

describe("Smallest AI sample rates", () => {
  it("publishes only 24000", () => {
    expect(provider.supportedSampleRates(MODEL)).toEqual([24_000]);
  });

  it("returns an empty array for unknown models", () => {
    expect(provider.supportedSampleRates("unknown")).toEqual([]);
  });

  it("accepts an explicit 24000 hint from getStitchOptions", () => {
    expect(provider.getStitchOptions(MODEL, { sampleRate: 24_000 })).toEqual({
      providerOptions: { output_format: "wav" },
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
      provider.resolveOutputFormat(MODEL, {
        format: "pcm",
        sampleRate: 48_000,
      })
    ).toThrow(UnsupportedSampleRateError);
  });
});
