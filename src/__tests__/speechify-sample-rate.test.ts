import { describe, expect, it } from "vitest";
import { UnsupportedSampleRateError } from "../errors.js";
import { SpeechifySpeechProvider } from "../providers/speechify/index.js";

const provider = new SpeechifySpeechProvider({ apiKey: "test" });
const MODEL = provider.defaultModel;

describe("Speechify sample rates", () => {
  it("publishes a single fixed 24 kHz output rate", () => {
    expect(provider.supportedSampleRates(MODEL)).toEqual([24_000]);
  });

  it("returns no rates for an unknown model", () => {
    expect(provider.supportedSampleRates("nope")).toEqual([]);
  });

  it("getStitchOptions returns decodable wav", () => {
    expect(provider.getStitchOptions(MODEL)).toEqual({
      providerOptions: { audio_format: "wav" },
      mediaType: "audio/wav",
    });
  });

  it("getStitchOptions returns undefined for an unknown model", () => {
    expect(provider.getStitchOptions("nope")).toBeUndefined();
  });

  it("resolveOutputFormat uses native wav", () => {
    expect(provider.resolveOutputFormat(MODEL, { format: "wav" })).toEqual({
      providerOptions: { audio_format: "wav" },
      expectedMediaType: "audio/wav",
    });
  });

  it("resolveOutputFormat uses native mp3", () => {
    expect(provider.resolveOutputFormat(MODEL, { format: "mp3" })).toEqual({
      providerOptions: { audio_format: "mp3" },
      expectedMediaType: "audio/mpeg",
    });
  });

  it("resolveOutputFormat falls back to decodable wav for pcm", () => {
    expect(provider.resolveOutputFormat(MODEL, { format: "pcm" })).toEqual({
      providerOptions: { audio_format: "wav" },
      expectedMediaType: "audio/wav",
    });
  });

  it("resolveOutputFormat returns undefined for an unknown model", () => {
    expect(
      provider.resolveOutputFormat("nope", { format: "wav" })
    ).toBeUndefined();
  });

  it("throws on an unsupported sample rate", () => {
    expect(() =>
      provider.resolveOutputFormat(MODEL, { format: "pcm", sampleRate: 48_000 })
    ).toThrow(UnsupportedSampleRateError);
  });
});
