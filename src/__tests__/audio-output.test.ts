import { describe, expect, it } from "vitest";
import {
  DEFAULT_MP3_BITRATE_KBPS,
  mediaTypeForOutput,
  resolveOutputForLocalConversion,
  validateOutput,
} from "../audio-output.js";

const BITRATE_ERROR_PATTERN = /bitrate is only valid/i;

describe("audio-output", () => {
  it("leaves omitted output undefined for gateway wire compatibility", () => {
    expect(validateOutput(undefined)).toBeUndefined();
  });

  it("normalizes mp3 bitrate for local conversion only", () => {
    expect(resolveOutputForLocalConversion({ format: "mp3" })).toEqual({
      format: "mp3",
      bitrate: DEFAULT_MP3_BITRATE_KBPS,
    });
  });

  it("preserves explicit mp3 bitrate", () => {
    expect(
      resolveOutputForLocalConversion({ format: "mp3", bitrate: 128 })
    ).toEqual({
      format: "mp3",
      bitrate: 128,
    });
  });

  it("rejects bitrate on non-mp3 formats", () => {
    expect(() =>
      validateOutput({ format: "wav", bitrate: 128 } as never)
    ).toThrow(BITRATE_ERROR_PATTERN);
  });

  it("maps output formats to media types", () => {
    expect(mediaTypeForOutput({ format: "wav" })).toBe("audio/wav");
    expect(mediaTypeForOutput({ format: "mp3", bitrate: 96 })).toBe(
      "audio/mpeg"
    );
    expect(mediaTypeForOutput({ format: "pcm", sampleRate: 24_000 })).toBe(
      "audio/pcm;rate=24000"
    );
  });
});
