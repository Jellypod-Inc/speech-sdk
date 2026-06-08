import { describe, expect, it } from "vitest";
import { UnsupportedSampleRateError } from "../errors.js";
import { FalSpeechProvider } from "../providers/fal/index.js";

const provider = new FalSpeechProvider({ apiKey: "test" });
const MODEL = "kokoro/american-english";

describe("Fal sample rates (no rate selection)", () => {
  it("getStitchOptions returns wav with no overrides when no rate is requested", () => {
    expect(provider.getStitchOptions(MODEL)).toEqual({
      providerOptions: {},
      mediaType: "audio/wav",
    });
  });

  it("resolveOutputFormat returns wav with no overrides when no rate is requested", () => {
    expect(provider.resolveOutputFormat(MODEL, { format: "wav" })).toEqual({
      providerOptions: {},
      expectedMediaType: "audio/wav",
    });
  });

  it("getStitchOptions throws when a sampleRate is explicitly requested", () => {
    expect(() =>
      provider.getStitchOptions(MODEL, { sampleRate: 48_000 })
    ).toThrow(UnsupportedSampleRateError);
  });

  it("resolveOutputFormat throws when a sampleRate is explicitly requested", () => {
    expect(() =>
      provider.resolveOutputFormat(MODEL, { format: "wav", sampleRate: 48_000 })
    ).toThrow(UnsupportedSampleRateError);
  });
});
