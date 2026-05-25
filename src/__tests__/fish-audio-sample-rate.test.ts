import { describe, expect, it } from "vitest";
import { UnsupportedSampleRateError } from "../errors.js";
import { FishAudioSpeechProvider } from "../providers/fish-audio/index.js";

const provider = new FishAudioSpeechProvider({ apiKey: "test" });
const MODEL = provider.defaultModel;

describe("Fish Audio sample rates", () => {
  it("publishes the documented WAV/PCM rate set", () => {
    expect(provider.supportedSampleRates(MODEL)).toEqual([
      8000, 16_000, 24_000, 32_000, 44_100,
    ]);
  });

  it("returns an empty array for unknown models", () => {
    expect(provider.supportedSampleRates("unknown")).toEqual([]);
  });

  it("getStitchOptions defaults to the highest supported rate (44100)", () => {
    expect(provider.getStitchOptions(MODEL)).toEqual({
      providerOptions: { format: "wav", sample_rate: 44_100 },
      mediaType: "audio/wav",
    });
  });

  it("getStitchOptions honors an explicit sampleRate hint", () => {
    expect(provider.getStitchOptions(MODEL, { sampleRate: 24_000 })).toEqual({
      providerOptions: { format: "wav", sample_rate: 24_000 },
      mediaType: "audio/wav",
    });
  });

  it("resolveOutputFormat picks the requested rate for wav", () => {
    expect(
      provider.resolveOutputFormat(MODEL, {
        format: "wav",
        sampleRate: 32_000,
      })
    ).toEqual({
      providerOptions: { format: "wav", sample_rate: 32_000 },
      expectedMediaType: "audio/wav",
    });
  });

  it("throws for unsupported sample rate from getStitchOptions", () => {
    expect(() =>
      provider.getStitchOptions(MODEL, { sampleRate: 48_000 })
    ).toThrow(UnsupportedSampleRateError);
  });

  it("throws for unsupported sample rate from resolveOutputFormat (wav)", () => {
    expect(() =>
      provider.resolveOutputFormat(MODEL, {
        format: "wav",
        sampleRate: 48_000,
      })
    ).toThrow(UnsupportedSampleRateError);
  });

  it("mp3 defaults to 44100 (highest mp3 rate) and forwards sample_rate", () => {
    expect(provider.resolveOutputFormat(MODEL, { format: "mp3" })).toEqual({
      providerOptions: { format: "mp3", sample_rate: 44_100 },
      expectedMediaType: "audio/mpeg",
    });
  });

  it("mp3 honors an explicit rate within the mp3 set (32000)", () => {
    expect(
      provider.resolveOutputFormat(MODEL, { format: "mp3", sampleRate: 32_000 })
    ).toEqual({
      providerOptions: { format: "mp3", sample_rate: 32_000 },
      expectedMediaType: "audio/mpeg",
    });
  });

  it("mp3 throws for a rate valid for wav/pcm but not mp3 (8000)", () => {
    expect(() =>
      provider.resolveOutputFormat(MODEL, { format: "mp3", sampleRate: 8000 })
    ).toThrow(UnsupportedSampleRateError);
  });
});
