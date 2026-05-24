import { describe, expect, it } from "vitest";
import { UnsupportedSampleRateError } from "../errors.js";
import { ElevenLabsSpeechProvider } from "../providers/elevenlabs/index.js";

const provider = new ElevenLabsSpeechProvider({ apiKey: "test" });
const MODEL = "eleven_multilingual_v2";

describe("ElevenLabs supported sample rates", () => {
  it("publishes the full PCM/WAV rate set", () => {
    expect(provider.supportedSampleRates(MODEL)).toEqual([
      8000, 16_000, 22_050, 24_000, 32_000, 44_100, 48_000,
    ]);
  });

  it("returns undefined for unknown models", () => {
    expect(provider.supportedSampleRates("unknown")).toEqual([]);
  });
});

describe("ElevenLabs getStitchOptions sampleRate", () => {
  it("defaults to the highest supported rate (48000) when no hint", () => {
    expect(provider.getStitchOptions(MODEL)).toEqual({
      providerOptions: { output_format: "pcm_48000" },
      mediaType: "audio/pcm;rate=48000",
    });
  });

  it("honors an explicit sampleRate hint", () => {
    expect(provider.getStitchOptions(MODEL, { sampleRate: 24_000 })).toEqual({
      providerOptions: { output_format: "pcm_24000" },
      mediaType: "audio/pcm;rate=24000",
    });
  });

  it("throws for unsupported sample rate", () => {
    expect(() =>
      provider.getStitchOptions(MODEL, { sampleRate: 96_000 })
    ).toThrow(UnsupportedSampleRateError);
  });
});

describe("ElevenLabs resolveOutputFormat sampleRate", () => {
  it("wav defaults to wav_48000", () => {
    expect(provider.resolveOutputFormat(MODEL, { format: "wav" })).toEqual({
      providerOptions: { output_format: "pcm_48000" },
      expectedMediaType: "audio/pcm;rate=48000",
    });
  });

  it("pcm honors explicit sampleRate", () => {
    expect(
      provider.resolveOutputFormat(MODEL, {
        format: "pcm",
        sampleRate: 22_050,
      })
    ).toEqual({
      providerOptions: { output_format: "pcm_22050" },
      expectedMediaType: "audio/pcm;rate=22050",
    });
  });

  it("mp3 picks mp3_44100_<closest-bitrate> regardless of sampleRate (44.1 is mp3 cap)", () => {
    expect(
      provider.resolveOutputFormat(MODEL, { format: "mp3", bitrate: 128 })
    ).toEqual({
      providerOptions: { output_format: "mp3_44100_128" },
      expectedMediaType: "audio/mpeg",
    });
  });

  it("rejects unsupported sampleRate on pcm", () => {
    expect(() =>
      provider.resolveOutputFormat(MODEL, {
        format: "pcm",
        sampleRate: 96_000,
      })
    ).toThrow(UnsupportedSampleRateError);
  });
});
