import { describe, expect, it } from "vitest";
import { UnsupportedSampleRateError } from "../errors.js";
import { InworldSpeechProvider } from "../providers/inworld/index.js";

const provider = new InworldSpeechProvider({ apiKey: "test" });
const MODEL = provider.defaultModel;

describe("Inworld sample rates", () => {
  it("publishes the full LINEAR16 rate set", () => {
    expect(provider.supportedSampleRates(MODEL)).toEqual([
      8000, 16_000, 22_050, 24_000, 32_000, 44_100, 48_000,
    ]);
  });

  it("returns an empty array for unknown models", () => {
    expect(provider.supportedSampleRates("unknown")).toEqual([]);
  });

  it("getStitchOptions defaults to the highest supported rate (48000)", () => {
    expect(provider.getStitchOptions(MODEL)).toEqual({
      providerOptions: {
        audio_config: {
          audio_encoding: "LINEAR16",
          sample_rate_hertz: 48_000,
        },
      },
      mediaType: "audio/wav",
    });
  });

  it("getStitchOptions honors an explicit sampleRate hint", () => {
    expect(provider.getStitchOptions(MODEL, { sampleRate: 24_000 })).toEqual({
      providerOptions: {
        audio_config: {
          audio_encoding: "LINEAR16",
          sample_rate_hertz: 24_000,
        },
      },
      mediaType: "audio/wav",
    });
  });

  it("resolveOutputFormat picks the requested rate", () => {
    expect(
      provider.resolveOutputFormat(MODEL, {
        format: "wav",
        sampleRate: 22_050,
      })
    ).toEqual({
      providerOptions: {
        audio_config: {
          audio_encoding: "LINEAR16",
          sample_rate_hertz: 22_050,
        },
      },
      expectedMediaType: "audio/wav",
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
