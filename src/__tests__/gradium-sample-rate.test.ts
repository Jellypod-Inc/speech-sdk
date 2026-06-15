import { describe, expect, it } from "vitest";
import { UnsupportedSampleRateError } from "../errors.js";
import { GradiumSpeechProvider } from "../providers/gradium/index.js";

const provider = new GradiumSpeechProvider({ apiKey: "test" });
const MODEL = provider.defaultModel;

describe("Gradium sample rates", () => {
  it("publishes supported PCM output rates", () => {
    expect(provider.supportedSampleRates(MODEL)).toEqual([
      8000, 16_000, 22_050, 24_000, 44_100, 48_000,
    ]);
  });

  it("getStitchOptions defaults to 48000 Hz PCM", () => {
    const opts = provider.getStitchOptions(MODEL);
    expect(opts).toEqual({
      providerOptions: { output_format: "pcm_48000" },
      mediaType: "audio/pcm;rate=48000",
    });
  });

  it("resolveOutputFormat uses native wav by default", () => {
    const opts = provider.resolveOutputFormat(MODEL, { format: "wav" });
    expect(opts).toEqual({
      providerOptions: { output_format: "wav" },
      expectedMediaType: "audio/wav",
    });
  });

  it("resolveOutputFormat honors caller PCM rate", () => {
    const opts = provider.resolveOutputFormat(MODEL, {
      format: "pcm",
      sampleRate: 24_000,
    });
    expect(opts).toEqual({
      providerOptions: { output_format: "pcm_24000" },
      expectedMediaType: "audio/pcm;rate=24000",
    });
  });

  it("uses PCM when a non-default WAV sample rate needs local wrapping", () => {
    const opts = provider.resolveOutputFormat(MODEL, {
      format: "wav",
      sampleRate: 44_100,
    });
    expect(opts).toEqual({
      providerOptions: { output_format: "pcm_44100" },
      expectedMediaType: "audio/pcm;rate=44100",
    });
  });

  it("throws on unsupported rate", () => {
    expect(() =>
      provider.resolveOutputFormat(MODEL, { format: "pcm", sampleRate: 32_000 })
    ).toThrow(UnsupportedSampleRateError);
  });
});
