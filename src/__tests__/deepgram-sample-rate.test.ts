import { describe, expect, it } from "vitest";
import { UnsupportedSampleRateError } from "../errors.js";
import { DeepgramSpeechProvider } from "../providers/deepgram/index.js";

const provider = new DeepgramSpeechProvider({ apiKey: "test" });
const MODEL = provider.defaultModel;

describe("Deepgram sample rates", () => {
  it("publishes the documented set", () => {
    expect(provider.supportedSampleRates(MODEL)).toEqual([
      8000, 16_000, 24_000, 32_000, 48_000,
    ]);
  });

  it("getStitchOptions defaults to 48000", () => {
    const opts = provider.getStitchOptions(MODEL);
    expect(opts?.providerOptions).toMatchObject({
      encoding: "linear16",
      sample_rate: 48_000,
      container: "wav",
    });
  });

  it("resolveOutputFormat honors caller rate", () => {
    const opts = provider.resolveOutputFormat(MODEL, {
      format: "wav",
      sampleRate: 24_000,
    });
    expect(opts?.providerOptions).toMatchObject({ sample_rate: 24_000 });
  });

  it("throws on unsupported rate", () => {
    expect(() =>
      provider.resolveOutputFormat(MODEL, { format: "wav", sampleRate: 44_100 })
    ).toThrow(UnsupportedSampleRateError);
  });
});
