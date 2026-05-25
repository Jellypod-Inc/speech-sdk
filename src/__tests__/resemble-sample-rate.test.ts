import { describe, expect, it } from "vitest";
import { UnsupportedSampleRateError } from "../errors.js";
import { ResembleSpeechProvider } from "../providers/resemble/index.js";

const provider = new ResembleSpeechProvider({ apiKey: "test" });
const MODEL = provider.defaultModel;

describe("Resemble sample rates", () => {
  it("publishes the documented /synthesize rate set", () => {
    expect(provider.supportedSampleRates(MODEL)).toEqual([
      8000, 16_000, 22_050, 32_000, 44_100, 48_000,
    ]);
  });

  it("returns an empty array for unknown models", () => {
    expect(provider.supportedSampleRates("unknown")).toEqual([]);
  });

  it("getStitchOptions defaults to the highest rate and forwards sample_rate", () => {
    expect(provider.getStitchOptions(MODEL)).toEqual({
      providerOptions: { precision: "PCM_16", sample_rate: "48000" },
      mediaType: "audio/wav",
    });
  });

  it("getStitchOptions forwards an explicit rate as a string", () => {
    expect(provider.getStitchOptions(MODEL, { sampleRate: 32_000 })).toEqual({
      providerOptions: { precision: "PCM_16", sample_rate: "32000" },
      mediaType: "audio/wav",
    });
  });

  it("resolveOutputFormat forwards sample_rate for wav", () => {
    expect(
      provider.resolveOutputFormat(MODEL, { format: "wav", sampleRate: 22_050 })
    ).toEqual({
      providerOptions: {
        output_format: "wav",
        precision: "PCM_16",
        sample_rate: "22050",
      },
      expectedMediaType: "audio/wav",
    });
  });

  it("throws when caller requests an unsupported rate from getStitchOptions", () => {
    expect(() =>
      provider.getStitchOptions(MODEL, { sampleRate: 96_000 })
    ).toThrow(UnsupportedSampleRateError);
  });

  it("throws when caller requests an unsupported rate from resolveOutputFormat", () => {
    expect(() =>
      provider.resolveOutputFormat(MODEL, {
        format: "wav",
        sampleRate: 96_000,
      })
    ).toThrow(UnsupportedSampleRateError);
  });
});
