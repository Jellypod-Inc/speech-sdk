import { describe, expect, it } from "vitest";
import {
  concatPcmToWav,
  decodeToPcm16,
  normalizeRms,
} from "../conversation/pcm-concat.js";

// Default RMS target the SDK normalizes to (-20 dBFS in int16).
const DEFAULT_TARGET_RMS = 3277;

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

  it("resamples segments at different rates to the target rate", async () => {
    // 0.1 s @ 48k = 4800 samples; 0.1 s @ 12k = 1200 samples.
    // After resample to 24k: 4800/2 = 2400 and 1200*2 = 2400.
    // No gap, so total = 2400 + 2400 = 4800 samples → 9600 data bytes.
    const seg48k = new Int16Array(4800).fill(100);
    const seg12k = new Int16Array(1200).fill(100);

    const wav = await concatPcmToWav(
      [
        { pcm: seg48k, sampleRate: 48_000, channels: 1 },
        { pcm: seg12k, sampleRate: 12_000, channels: 1 },
      ],
      { gapMs: 0, targetSampleRate: 24_000 }
    );

    const dv = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    expect(dv.getUint32(40, true)).toBe(4800 * 2);
  });
});

describe("normalizeRms", () => {
  const mkSeg = (pcm: Int16Array) => ({
    pcm,
    sampleRate: 24_000,
    channels: 1,
  });

  it("scales a segment so its RMS matches the target amplitude", () => {
    // Constant-amplitude segment: every sample = RMS
    const seg = new Int16Array(1000).fill(1000);
    const [out] = normalizeRms([mkSeg(seg)], 5000);
    expect(out.pcm[0]).toBe(5000);
  });

  it("scales both loud and quiet segments independently to the same target", () => {
    const quiet = new Int16Array(1000).fill(500);
    const loud = new Int16Array(1000).fill(20_000);
    const [outQuiet, outLoud] = normalizeRms([mkSeg(quiet), mkSeg(loud)], 5000);
    // Both segments end up at the same RMS regardless of their input level.
    expect(outQuiet.pcm[0]).toBe(5000);
    expect(outLoud.pcm[0]).toBe(5000);
  });

  it("produces the same output for a segment across multiple calls (deterministic)", () => {
    const seg = new Int16Array(1000).fill(1234);
    const [a] = normalizeRms([mkSeg(seg)]);
    const [b] = normalizeRms([mkSeg(seg)]);
    expect(a.pcm).toEqual(b.pcm);
    // And independent of what else is in the batch:
    const other = new Int16Array(1000).fill(20_000);
    const [c] = normalizeRms([mkSeg(seg), mkSeg(other)]);
    expect(c.pcm).toEqual(a.pcm);
  });

  it("uses the default -20 dBFS target when target is omitted", () => {
    const seg = new Int16Array(1000).fill(10_000);
    const [out] = normalizeRms([mkSeg(seg)]);
    expect(out.pcm[0]).toBe(DEFAULT_TARGET_RMS);
  });

  it("clamps to int16 range when boosting a quiet segment with loud peaks", () => {
    const pcm = new Int16Array(1000);
    for (let i = 0; i < pcm.length; i++) {
      pcm[i] = i === 0 ? 30_000 : 100;
    }
    const [out] = normalizeRms([mkSeg(pcm)], 10_000);
    expect(out.pcm[0]).toBe(32_767);
  });

  it("leaves silent segments untouched (no divide-by-zero)", () => {
    const silent = new Int16Array(1000);
    const [out] = normalizeRms([mkSeg(silent)]);
    expect(out.pcm.every((v) => v === 0)).toBe(true);
  });

  it("does not mutate input segments", () => {
    const pcm = new Int16Array(1000).fill(1000);
    normalizeRms([mkSeg(pcm)], 5000);
    expect(pcm[0]).toBe(1000);
  });
});
