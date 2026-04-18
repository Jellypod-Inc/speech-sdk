import { describe, expect, it } from "vitest";
import {
  concatPcmToWav,
  decodeToPcm16,
  normalizeRmsToLoudest,
  resamplePcm16LinearMono,
  silencePcm16,
} from "../conversation/pcm-concat.js";

function writeWavHeader(
  dataLen: number,
  sampleRate: number,
  channels: number
): Uint8Array {
  const header = new Uint8Array(44);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x52_49_46_46); // "RIFF"
  view.setUint32(4, 36 + dataLen, true);
  view.setUint32(8, 0x57_41_56_45); // "WAVE"
  view.setUint32(12, 0x66_6d_74_20); // "fmt "
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x64_61_74_61); // "data"
  view.setUint32(40, dataLen, true);
  return header;
}

describe("decodeToPcm16", () => {
  it("returns bytes untouched when mediaType is audio/pcm with rate", () => {
    const pcm = new Uint8Array([1, 0, 2, 0, 3, 0, 4, 0]);
    const out = decodeToPcm16(pcm, "audio/pcm;rate=24000");
    expect(out.sampleRate).toBe(24_000);
    expect(out.channels).toBe(1);
    expect(out.pcm).toEqual(new Int16Array([1, 2, 3, 4]));
  });

  it("parses a valid WAV header and returns PCM payload + sampleRate", () => {
    const payload = new Uint8Array([10, 0, 20, 0]);
    const header = writeWavHeader(payload.length, 16_000, 1);
    const file = new Uint8Array(header.length + payload.length);
    file.set(header);
    file.set(payload, header.length);

    const out = decodeToPcm16(file, "audio/wav");
    expect(out.sampleRate).toBe(16_000);
    expect(out.channels).toBe(1);
    expect(out.pcm).toEqual(new Int16Array([10, 20]));
  });

  it("downmixes 2-channel interleaved PCM to mono by averaging", () => {
    const pcm = new Int16Array([100, 200, -1000, 1000]);
    const bytes = new Uint8Array(pcm.buffer);
    const out = decodeToPcm16(bytes, "audio/pcm;rate=24000;channels=2");
    expect(out.channels).toBe(1);
    expect(Array.from(out.pcm)).toEqual([150, 0]);
  });

  it("throws on unsupported mediaType", () => {
    expect(
      () => decodeToPcm16(new Uint8Array([1, 2, 3]), "audio/mpeg")
      // biome-ignore lint/performance/useTopLevelRegex: single-use test regex
    ).toThrow(/unsupported stitch mediaType/);
  });
});

describe("resamplePcm16LinearMono", () => {
  it("is a no-op when rates match", () => {
    const input = new Int16Array([1, 2, 3, 4]);
    expect(resamplePcm16LinearMono(input, 24_000, 24_000)).toBe(input);
  });

  it("upsamples from 12 kHz to 24 kHz", () => {
    const input = new Int16Array([0, 1000]);
    const out = resamplePcm16LinearMono(input, 12_000, 24_000);
    expect(out.length).toBe(4);
    expect(out[0]).toBe(0);
    expect(out[1]).toBeGreaterThan(0);
  });

  it("downsamples roughly preserving signal magnitude", () => {
    const input = new Int16Array(100);
    input.fill(500);
    const out = resamplePcm16LinearMono(input, 48_000, 24_000);
    expect(out.length).toBe(50);
    for (const s of out) {
      expect(s).toBe(500);
    }
  });
});

describe("silencePcm16", () => {
  it("returns zero-filled Int16Array of correct length", () => {
    const s = silencePcm16(300, 24_000);
    expect(s.length).toBe(Math.round(0.3 * 24_000));
    expect(s.every((v) => v === 0)).toBe(true);
  });
});

describe("concatPcmToWav", () => {
  it("concats two 24 kHz mono PCM segments with 300 ms gap and produces a valid WAV", async () => {
    const seg = new Int16Array(2400);
    seg.fill(42);

    const wav = await concatPcmToWav(
      [
        { pcm: seg, sampleRate: 24_000, channels: 1 },
        { pcm: seg, sampleRate: 24_000, channels: 1 },
      ],
      { gapMs: 300, targetSampleRate: 24_000 }
    );

    expect(wav.length).toBeGreaterThan(44);
    const dv = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    expect(dv.getUint32(0)).toBe(0x52_49_46_46);
    expect(dv.getUint32(8)).toBe(0x57_41_56_45);

    const expectedSamples = 2400 + 7200 + 2400;
    const expectedDataLen = expectedSamples * 2;
    expect(dv.getUint32(40, true)).toBe(expectedDataLen);
  });
});

describe("normalizeRmsToLoudest", () => {
  const mkSeg = (pcm: Int16Array) => ({
    pcm,
    sampleRate: 24_000,
    channels: 1,
  });

  it("leaves the loudest segment unchanged", () => {
    const loud = new Int16Array(1000).fill(10_000);
    const quiet = new Int16Array(1000).fill(1000);
    const [outLoud, outQuiet] = normalizeRmsToLoudest([
      mkSeg(loud),
      mkSeg(quiet),
    ]);
    expect(outLoud.pcm[0]).toBe(10_000);
    expect(outQuiet.pcm[0]).toBeGreaterThan(1000);
  });

  it("scales a 10x-quieter segment up to the loudest RMS", () => {
    const loud = new Int16Array(1000).fill(10_000);
    const quiet = new Int16Array(1000).fill(1000);
    const [, outQuiet] = normalizeRmsToLoudest([mkSeg(loud), mkSeg(quiet)]);
    // 1000 scaled by 10_000/1000 = 10x → 10_000
    expect(outQuiet.pcm[0]).toBe(10_000);
  });

  it("clamps to int16 range on overflow", () => {
    // Peak values near the max get scaled up but must not overflow.
    const loud = new Int16Array(1000).fill(30_000);
    const quiet = new Int16Array(1000).fill(20_000);
    const [, outQuiet] = normalizeRmsToLoudest([mkSeg(loud), mkSeg(quiet)]);
    expect(outQuiet.pcm[0]).toBeLessThanOrEqual(32_767);
    expect(outQuiet.pcm[0]).toBeGreaterThanOrEqual(-32_768);
  });

  it("handles an all-silent segment without dividing by zero", () => {
    const loud = new Int16Array(1000).fill(5000);
    const silent = new Int16Array(1000);
    const [outLoud, outSilent] = normalizeRmsToLoudest([
      mkSeg(loud),
      mkSeg(silent),
    ]);
    expect(outLoud.pcm[0]).toBe(5000);
    expect(outSilent.pcm.every((v) => v === 0)).toBe(true);
  });

  it("returns a no-op when all segments are silent", () => {
    const a = new Int16Array(10);
    const b = new Int16Array(10);
    const [outA, outB] = normalizeRmsToLoudest([mkSeg(a), mkSeg(b)]);
    expect(outA.pcm).toEqual(a);
    expect(outB.pcm).toEqual(b);
  });

  it("does not mutate input segments", () => {
    const loud = new Int16Array(1000).fill(10_000);
    const quiet = new Int16Array(1000).fill(1000);
    const inputs = [mkSeg(loud), mkSeg(quiet)];
    normalizeRmsToLoudest(inputs);
    expect(quiet[0]).toBe(1000);
  });
});
