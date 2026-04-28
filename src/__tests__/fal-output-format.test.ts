import { describe, expect, it } from "vitest";
import { FalSpeechProvider } from "../providers/fal/index.js";

describe("FalSpeechProvider.resolveOutputFormat", () => {
  const provider = new FalSpeechProvider({ apiKey: "test" });

  describe("f5-tts (native wav)", () => {
    it("returns native options when user wants wav", () => {
      const result = provider.resolveOutputFormat?.("f5-tts", {
        format: "wav",
      });
      expect(result).toEqual({
        providerOptions: {},
        expectedMediaType: "audio/wav",
      });
    });

    it("returns undefined when user wants pcm (no native pcm)", () => {
      expect(
        provider.resolveOutputFormat?.("f5-tts", { format: "pcm" })
      ).toBeUndefined();
    });

    it("returns undefined when user wants mp3 (no native mp3)", () => {
      expect(
        provider.resolveOutputFormat?.("f5-tts", { format: "mp3" })
      ).toBeUndefined();
    });
  });

  describe("kokoro (native wav)", () => {
    it("returns native options when user wants wav", () => {
      const result = provider.resolveOutputFormat?.("kokoro", {
        format: "wav",
      });
      expect(result).toEqual({
        providerOptions: {},
        expectedMediaType: "audio/wav",
      });
    });

    it("returns undefined when user wants pcm (no native pcm)", () => {
      expect(
        provider.resolveOutputFormat?.("kokoro", { format: "pcm" })
      ).toBeUndefined();
    });

    it("returns undefined when user wants mp3 (no native mp3)", () => {
      expect(
        provider.resolveOutputFormat?.("kokoro", { format: "mp3" })
      ).toBeUndefined();
    });
  });

  describe("orpheus-tts (native wav)", () => {
    it("returns native options when user wants wav", () => {
      const result = provider.resolveOutputFormat?.("orpheus-tts", {
        format: "wav",
      });
      expect(result).toEqual({
        providerOptions: {},
        expectedMediaType: "audio/wav",
      });
    });

    it("returns undefined when user wants pcm (no native pcm)", () => {
      expect(
        provider.resolveOutputFormat?.("orpheus-tts", { format: "pcm" })
      ).toBeUndefined();
    });

    it("returns undefined when user wants mp3 (no native mp3)", () => {
      expect(
        provider.resolveOutputFormat?.("orpheus-tts", { format: "mp3" })
      ).toBeUndefined();
    });
  });

  it("returns undefined for unknown model id", () => {
    expect(
      provider.resolveOutputFormat?.("does-not-exist", { format: "wav" })
    ).toBeUndefined();
  });
});
