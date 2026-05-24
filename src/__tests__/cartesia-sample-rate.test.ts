import { describe, expect, it } from "vitest";
import { UnsupportedSampleRateError } from "../errors.js";
import { CartesiaSpeechProvider } from "../providers/cartesia/index.js";

const provider = new CartesiaSpeechProvider({ apiKey: "test" });
const MODEL = provider.defaultModel;

describe("Cartesia sample rates", () => {
  it("publishes the full rate set", () => {
    expect(provider.supportedSampleRates(MODEL)).toEqual([
      8000, 16_000, 22_050, 24_000, 44_100, 48_000,
    ]);
  });

  it("getStitchOptions defaults to 48000", () => {
    const opts = provider.getStitchOptions(MODEL);
    expect(opts?.providerOptions).toMatchObject({
      output_format: { sample_rate: 48_000 },
    });
    expect(opts?.mediaType).toBe("audio/wav");
  });

  it("getStitchOptions honors explicit rate", () => {
    const opts = provider.getStitchOptions(MODEL, { sampleRate: 24_000 });
    expect(opts?.providerOptions).toMatchObject({
      output_format: { sample_rate: 24_000 },
    });
  });

  it("resolveOutputFormat picks the requested rate", () => {
    const opts = provider.resolveOutputFormat(MODEL, {
      format: "wav",
      sampleRate: 44_100,
    });
    expect(opts?.providerOptions).toMatchObject({
      output_format: { sample_rate: 44_100 },
    });
  });

  it("throws for unsupported rate", () => {
    expect(() =>
      provider.resolveOutputFormat(MODEL, { format: "wav", sampleRate: 96_000 })
    ).toThrow(UnsupportedSampleRateError);
  });
});
