import { describe, expect, it } from "vitest";
import { UnsupportedSampleRateError } from "../errors.js";
import { XaiSpeechProvider } from "../providers/xai/index.js";

const provider = new XaiSpeechProvider({ apiKey: "test" });
const MODEL = provider.defaultModel;

describe("xAI sample rates", () => {
  it("publishes the documented grok-tts rate set", () => {
    expect(provider.supportedSampleRates(MODEL)).toEqual([
      8000, 16_000, 22_050, 24_000, 44_100, 48_000,
    ]);
  });

  it("returns an empty array for unknown models", () => {
    expect(provider.supportedSampleRates("unknown")).toEqual([]);
  });

  it("getStitchOptions defaults to the highest supported rate (48000)", () => {
    expect(provider.getStitchOptions(MODEL)).toEqual({
      providerOptions: {
        output_format: { codec: "wav", sample_rate: 48_000 },
      },
      mediaType: "audio/wav",
    });
  });

  it("getStitchOptions honors an explicit sampleRate hint", () => {
    expect(provider.getStitchOptions(MODEL, { sampleRate: 24_000 })).toEqual({
      providerOptions: {
        output_format: { codec: "wav", sample_rate: 24_000 },
      },
      mediaType: "audio/wav",
    });
  });

  it("resolveOutputFormat picks the requested rate for pcm", () => {
    expect(
      provider.resolveOutputFormat(MODEL, {
        format: "pcm",
        sampleRate: 16_000,
      })
    ).toEqual({
      providerOptions: {
        output_format: { codec: "pcm", sample_rate: 16_000 },
      },
      expectedMediaType: "audio/pcm;rate=16000",
    });
  });

  it("throws for unsupported sample rate from getStitchOptions", () => {
    expect(() =>
      provider.getStitchOptions(MODEL, { sampleRate: 96_000 })
    ).toThrow(UnsupportedSampleRateError);
  });

  it("throws for unsupported sample rate from resolveOutputFormat", () => {
    expect(() =>
      provider.resolveOutputFormat(MODEL, {
        format: "wav",
        sampleRate: 96_000,
      })
    ).toThrow(UnsupportedSampleRateError);
  });
});
