import { describe, expect, it } from "vitest";
import { UnsupportedSampleRateError } from "../errors.js";
import { ResembleSpeechProvider } from "../providers/resemble/index.js";

const provider = new ResembleSpeechProvider({ apiKey: "test" });
const MODEL = provider.defaultModel;

describe("Resemble sample rates", () => {
  it("publishes only 44100", () => {
    expect(provider.supportedSampleRates(MODEL)).toEqual([44_100]);
  });

  it("returns an empty array for unknown models", () => {
    expect(provider.supportedSampleRates("unknown")).toEqual([]);
  });

  it("accepts an explicit 44100 hint from getStitchOptions", () => {
    expect(provider.getStitchOptions(MODEL, { sampleRate: 44_100 })).toEqual({
      providerOptions: { precision: "PCM_16" },
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
        format: "wav",
        sampleRate: 48_000,
      })
    ).toThrow(UnsupportedSampleRateError);
  });
});
