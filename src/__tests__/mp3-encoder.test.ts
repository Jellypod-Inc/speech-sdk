import { describe, expect, it } from "vitest";
import { encodePcm16ToMp3 } from "../encoders/mp3.js";

const EMPTY_ERROR_PATTERN = /empty/i;
const UNSUPPORTED_SAMPLE_RATE_PATTERN = /unsupported sample rate/i;

function makeSinePcm(sampleRate: number, durationSeconds: number): Uint8Array {
  const sampleCount = Math.floor(sampleRate * durationSeconds);
  const samples = new Int16Array(sampleCount);
  const frequency = 440;
  const amplitude = 0.25 * 0x7f_ff;
  for (let i = 0; i < sampleCount; i++) {
    samples[i] = Math.round(
      amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate)
    );
  }
  return new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
}

describe("encodePcm16ToMp3", () => {
  it("produces non-empty output for valid pcm input", async () => {
    const pcm = makeSinePcm(24_000, 0.25);
    const mp3 = await encodePcm16ToMp3({
      pcm,
      sampleRate: 24_000,
      bitrateKbps: 96,
    });
    expect(mp3.byteLength).toBeGreaterThan(0);
  });

  it("emits a valid mpeg frame sync in the first two bytes", async () => {
    const pcm = makeSinePcm(24_000, 0.25);
    const mp3 = await encodePcm16ToMp3({
      pcm,
      sampleRate: 24_000,
      bitrateKbps: 96,
    });
    expect(mp3[0]).toBe(0xff);
    // biome-ignore lint/suspicious/noBitwiseOperators: frame sync requires bitwise mask
    expect(mp3[1] & 0xe0).toBe(0xe0);
  });

  it("rejects empty input", async () => {
    await expect(
      encodePcm16ToMp3({
        pcm: new Uint8Array(0),
        sampleRate: 24_000,
        bitrateKbps: 96,
      })
    ).rejects.toThrow(EMPTY_ERROR_PATTERN);
  });

  it("rejects unsupported sample rates", async () => {
    const pcm = makeSinePcm(24_000, 0.05);
    await expect(
      encodePcm16ToMp3({
        pcm,
        sampleRate: 12_345,
        bitrateKbps: 96,
      })
    ).rejects.toThrow(UNSUPPORTED_SAMPLE_RATE_PATTERN);
  });
});
