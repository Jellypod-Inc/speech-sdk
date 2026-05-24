import { describe, expect, it } from "vitest";
import { decodeAudioToPcm16 } from "../audio-decode.js";
import {
  concatPcmToWav,
  DEFAULT_VOLUME_DBFS,
  dbfsToInt16Rms,
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

describe("decodeAudioToPcm16", () => {
  it("returns bytes untouched when mediaType is audio/pcm with rate", async () => {
    const pcm = new Uint8Array([1, 0, 2, 0, 3, 0, 4, 0]);
    const out = await decodeAudioToPcm16(pcm, "audio/pcm;rate=24000");
    expect(out.sampleRate).toBe(24_000);
    expect(out.channels).toBe(1);
    expect(out.pcm).toEqual(new Int16Array([1, 2, 3, 4]));
  });

  it("parses a valid WAV header and returns PCM payload + sampleRate", async () => {
    const payload = new Uint8Array([10, 0, 20, 0]);
    const header = writeWavHeader(payload.length, 16_000, 1);
    const file = new Uint8Array(header.length + payload.length);
    file.set(header);
    file.set(payload, header.length);

    const out = await decodeAudioToPcm16(file, "audio/wav");
    expect(out.sampleRate).toBe(16_000);
    expect(out.channels).toBe(1);
    expect(out.pcm).toEqual(new Int16Array([10, 20]));
  });

  it("downmixes 2-channel interleaved PCM to mono by averaging", async () => {
    const pcm = new Int16Array([100, 200, -1000, 1000]);
    const bytes = new Uint8Array(pcm.buffer);
    const out = await decodeAudioToPcm16(
      bytes,
      "audio/pcm;rate=24000;channels=2"
    );
    expect(out.channels).toBe(1);
    expect(Array.from(out.pcm)).toEqual([150, 0]);
  });

  it("decodes float32 PCM via the encoding=float32 mediaType param", async () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1, 1.5, -1.5]);
    const bytes = new Uint8Array(samples.buffer);
    const out = await decodeAudioToPcm16(
      bytes,
      "audio/pcm;rate=24000;encoding=float32"
    );
    expect(out.sampleRate).toBe(24_000);
    expect(out.channels).toBe(1);
    expect(out.pcm.length).toBe(7);
    expect(out.pcm[0]).toBe(0);
    expect(out.pcm[1]).toBeGreaterThan(16_000);
    expect(out.pcm[1]).toBeLessThanOrEqual(32_767);
    expect(out.pcm[2]).toBeLessThan(-16_000);
    expect(out.pcm[2]).toBeGreaterThanOrEqual(-32_768);
    expect(out.pcm[3]).toBe(32_767);
    expect(out.pcm[4]).toBeLessThanOrEqual(-32_767);
    expect(out.pcm[5]).toBe(32_767);
    expect(out.pcm[6]).toBeLessThanOrEqual(-32_767);
  });

  it("downmixes 2-channel float32 PCM to mono", async () => {
    const samples = new Float32Array([0.25, 0.75, -0.5, 0.5]);
    const bytes = new Uint8Array(samples.buffer);
    const out = await decodeAudioToPcm16(
      bytes,
      "audio/pcm;rate=24000;channels=2;encoding=float32"
    );
    expect(out.channels).toBe(1);
    expect(out.pcm.length).toBe(2);
    const a = Math.round(0.25 * 32_767);
    const b = Math.round(0.75 * 32_767);
    const c = Math.round(-0.5 * 32_767);
    const d = Math.round(0.5 * 32_767);
    expect(out.pcm[0]).toBeCloseTo(Math.round((a + b) / 2), -2);
    expect(out.pcm[1]).toBeCloseTo(Math.round((c + d) / 2), -2);
  });
});

describe("dbfsToInt16Rms", () => {
  it("returns 3277 for the default -20 dBFS target", () => {
    expect(dbfsToInt16Rms(DEFAULT_VOLUME_DBFS)).toBe(3277);
  });

  it("returns int16 max (32767) at 0 dBFS", () => {
    expect(dbfsToInt16Rms(0)).toBe(32_767);
  });

  it("halves amplitude (-6 dBFS ≈ 16384) for every -6 dB", () => {
    expect(dbfsToInt16Rms(-6)).toBeCloseTo(32_767 * 10 ** (-6 / 20), 0);
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

  it("caps gain at peak-safe headroom when boosting a quiet segment with loud peaks", () => {
    // Previously this test asserted hard-clip to 32767. The peak-safe gain
    // intentionally backs off so the loud peak lands at ~INT16_MAX * 0.99
    // instead of clipping — the old behavior was the bug being fixed.
    const pcm = new Int16Array(1000);
    for (let i = 0; i < pcm.length; i++) {
      pcm[i] = i === 0 ? 30_000 : 100;
    }
    const [out] = normalizeRms([mkSeg(pcm)], 10_000);
    expect(out.pcm[0]).toBeLessThanOrEqual(Math.floor(32_767 * 0.99));
    expect(out.pcm[0]).toBeGreaterThan(32_000);
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

describe("normalizeRms peak safety", () => {
  it("caps gain so peaks do not exceed int16 full scale", () => {
    // Source: RMS ~1500, peak 20000. Target: -16 dBFS (~5193 int16 RMS) -> desired gain 3.46.
    // Peak * desired gain = 20000 * 3.46 = 69,200 -> would clip to 32767.
    // Peak-safe cap: floor(INT16_MAX * 0.99 / 20000) ~= 1.62.
    const pcm = new Int16Array(2400);
    for (let i = 0; i < pcm.length; i++) {
      pcm[i] = Math.round(Math.sin((i / 24_000) * 2 * Math.PI * 440) * 1500);
    }
    pcm[100] = 20_000;
    pcm[200] = -20_000;

    const targetRms = dbfsToInt16Rms(-16);
    const [out] = normalizeRms(
      [{ pcm, sampleRate: 24_000, channels: 1 }],
      targetRms
    );

    let maxAbs = 0;
    for (const s of out.pcm) {
      const a = s < 0 ? -s : s;
      if (a > maxAbs) {
        maxAbs = a;
      }
    }

    expect(maxAbs).toBeLessThanOrEqual(Math.floor(32_767 * 0.99));
    // No sample at exactly ±32767 means no hard clip happened.
    expect(Array.from(out.pcm).some((s) => s === 32_767 || s === -32_768)).toBe(
      false
    );
  });

  it("hits the requested RMS target when peaks have headroom", () => {
    // Source: clean sine at 1000 amplitude (~707 RMS), peak 1000. Headroom is huge -> no cap.
    const pcm = new Int16Array(24_000);
    for (let i = 0; i < pcm.length; i++) {
      pcm[i] = Math.round(Math.sin((i / 24_000) * 2 * Math.PI * 440) * 1000);
    }
    const target = dbfsToInt16Rms(DEFAULT_VOLUME_DBFS);
    const [out] = normalizeRms(
      [{ pcm, sampleRate: 24_000, channels: 1 }],
      target
    );

    let sumSq = 0;
    for (const s of out.pcm) {
      sumSq += s * s;
    }
    const outRms = Math.sqrt(sumSq / out.pcm.length);

    expect(outRms).toBeGreaterThan(target * 0.95);
    expect(outRms).toBeLessThan(target * 1.05);
  });

  it("leaves silent segments untouched", () => {
    const pcm = new Int16Array(1000);
    const [out] = normalizeRms([{ pcm, sampleRate: 24_000, channels: 1 }]);
    expect(out.pcm).toEqual(pcm);
  });
});
