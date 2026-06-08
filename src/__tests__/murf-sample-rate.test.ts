import { describe, expect, it } from "vitest";
import { UnsupportedSampleRateError } from "../errors.js";
import { MurfSpeechProvider } from "../providers/murf/index.js";

const provider = new MurfSpeechProvider({ apiKey: "test" });
const MODEL = provider.defaultModel;

describe("Murf sample rates", () => {
  it("publishes the documented rate set", () => {
    expect(provider.supportedSampleRates(MODEL)).toEqual([
      8000, 24_000, 44_100, 48_000,
    ]);
  });

  it("returns an empty array for unknown models", () => {
    expect(provider.supportedSampleRates("unknown")).toEqual([]);
  });

  it("getStitchOptions defaults to the highest supported rate (48000)", () => {
    expect(provider.getStitchOptions(MODEL)).toEqual({
      providerOptions: { format: "WAV", sampleRate: 48_000 },
      mediaType: "audio/wav",
    });
  });

  it("getStitchOptions honors an explicit sampleRate hint", () => {
    expect(provider.getStitchOptions(MODEL, { sampleRate: 24_000 })).toEqual({
      providerOptions: { format: "WAV", sampleRate: 24_000 },
      mediaType: "audio/wav",
    });
  });

  it("resolveOutputFormat picks the requested rate for pcm", () => {
    expect(
      provider.resolveOutputFormat(MODEL, {
        format: "pcm",
        sampleRate: 44_100,
      })
    ).toEqual({
      providerOptions: { format: "PCM", sampleRate: 44_100 },
      expectedMediaType: "audio/pcm;rate=44100",
    });
  });

  it("throws for unsupported sample rate from getStitchOptions", () => {
    expect(() =>
      provider.getStitchOptions(MODEL, { sampleRate: 16_000 })
    ).toThrow(UnsupportedSampleRateError);
  });

  it("throws for unsupported sample rate from resolveOutputFormat", () => {
    expect(() =>
      provider.resolveOutputFormat(MODEL, {
        format: "wav",
        sampleRate: 16_000,
      })
    ).toThrow(UnsupportedSampleRateError);
  });

  it("FALCON publishes the wider streaming rate set (adds 16000)", () => {
    expect(provider.supportedSampleRates("FALCON")).toEqual([
      8000, 16_000, 24_000, 44_100, 48_000,
    ]);
  });

  it("FALCON accepts 16000 (valid on the /speech/stream endpoint)", () => {
    expect(
      provider.resolveOutputFormat("FALCON", {
        format: "wav",
        sampleRate: 16_000,
      })
    ).toEqual({
      providerOptions: { format: "WAV", sampleRate: 16_000 },
      expectedMediaType: "audio/wav",
    });
  });
});
