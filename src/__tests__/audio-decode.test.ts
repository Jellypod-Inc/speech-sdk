import { describe, expect, it } from "vitest";
import { decodeAudioToPcm16 } from "../audio-decode.js";

const MISSING_RATE_RE = /missing a required "rate=<hz>" parameter/;

function pcmBytes(numSamples: number): Uint8Array {
  return new Uint8Array(new Int16Array(numSamples).buffer);
}

describe("decodeAudioToPcm16 rate requirement", () => {
  it("throws on audio/pcm without rate parameter", async () => {
    await expect(
      decodeAudioToPcm16(pcmBytes(100), "audio/pcm")
    ).rejects.toThrow(MISSING_RATE_RE);
  });

  it("throws on audio/x-pcm without rate parameter", async () => {
    await expect(
      decodeAudioToPcm16(pcmBytes(100), "audio/x-pcm")
    ).rejects.toThrow(MISSING_RATE_RE);
  });

  it("throws on audio/pcm with rate=0 (rejected by parseMediaTypeParam)", async () => {
    await expect(
      decodeAudioToPcm16(pcmBytes(100), "audio/pcm;rate=0")
    ).rejects.toThrow(MISSING_RATE_RE);
  });

  it("accepts audio/pcm with explicit rate", async () => {
    const result = await decodeAudioToPcm16(
      pcmBytes(2400),
      "audio/pcm;rate=24000"
    );
    expect(result.sampleRate).toBe(24_000);
    expect(result.pcm.length).toBe(2400);
  });

  it("accepts audio/pcm with rate + encoding=float32", async () => {
    const f32 = new Float32Array(1000);
    const bytes = new Uint8Array(f32.buffer);
    const result = await decodeAudioToPcm16(
      bytes,
      "audio/pcm;rate=24000;encoding=float32"
    );
    expect(result.sampleRate).toBe(24_000);
    expect(result.pcm.length).toBe(1000);
  });
});
