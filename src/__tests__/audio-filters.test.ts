import { describe, expect, it } from "vitest";
import { applyFiltersToSegment, validateFilters } from "../audio-filters.js";
import type { Pcm16Segment } from "../conversation/pcm-concat.js";

const SAMPLE_RATE = 48_000;
const INT16_MAX = 32_767;
const DB_MULTIPLIER = 20;

function sineSegment(
  frequencyHz: number,
  amplitude: number,
  seconds = 1
): Pcm16Segment {
  const pcm = new Int16Array(Math.floor(SAMPLE_RATE * seconds));
  for (let i = 0; i < pcm.length; i += 1) {
    pcm[i] = Math.round(
      amplitude * Math.sin((2 * Math.PI * frequencyHz * i) / SAMPLE_RATE)
    );
  }
  return { channels: 1, pcm, sampleRate: SAMPLE_RATE };
}

function rmsDb(pcm: Int16Array): number {
  let sum = 0;
  for (const v of pcm) {
    sum += v * v;
  }
  return DB_MULTIPLIER * Math.log10(Math.sqrt(sum / pcm.length) / INT16_MAX);
}

describe("applyFiltersToSegment", () => {
  it("high-pass attenuates 50 Hz rumble by roughly the Butterworth slope", () => {
    // 2nd-order high-pass at 80 Hz: 50 Hz sits ~0.7 octaves below the corner,
    // so theory predicts ~8-9 dB of attenuation.
    const segment = sineSegment(50, 10_000);
    const before = rmsDb(segment.pcm);
    const filtered = applyFiltersToSegment(segment, [
      { frequencyHz: 80, type: "highpass" },
    ]);
    const reduction = before - rmsDb(filtered.pcm);
    expect(reduction).toBeGreaterThan(7);
    expect(reduction).toBeLessThan(11);
  });

  it("high-pass leaves 1 kHz speech content essentially unchanged", () => {
    const segment = sineSegment(1000, 10_000);
    const before = rmsDb(segment.pcm);
    const filtered = applyFiltersToSegment(segment, [
      { frequencyHz: 80, type: "highpass" },
    ]);
    expect(Math.abs(before - rmsDb(filtered.pcm))).toBeLessThan(0.2);
  });

  it("low-shelf cuts 100 Hz by roughly the shelf gain", () => {
    const segment = sineSegment(100, 10_000);
    const before = rmsDb(segment.pcm);
    const filtered = applyFiltersToSegment(segment, [
      { frequencyHz: 200, gainDb: -4, type: "lowshelf" },
    ]);
    const reduction = before - rmsDb(filtered.pcm);
    expect(reduction).toBeGreaterThan(2.5);
    expect(reduction).toBeLessThan(4.5);
  });

  it("low-shelf leaves 2 kHz essentially unchanged", () => {
    const segment = sineSegment(2000, 10_000);
    const before = rmsDb(segment.pcm);
    const filtered = applyFiltersToSegment(segment, [
      { frequencyHz: 200, gainDb: -4, type: "lowshelf" },
    ]);
    expect(Math.abs(before - rmsDb(filtered.pcm))).toBeLessThan(0.3);
  });

  it("preserves segment length, sample rate, and channel count", () => {
    const segment = sineSegment(300, 8000);
    const filtered = applyFiltersToSegment(segment, [
      { frequencyHz: 80, type: "highpass" },
      { frequencyHz: 250, gainDb: -6, type: "lowshelf" },
    ]);
    expect(filtered.pcm.length).toBe(segment.pcm.length);
    expect(filtered.sampleRate).toBe(segment.sampleRate);
    expect(filtered.channels).toBe(segment.channels);
  });

  it("is deterministic", () => {
    const segment = sineSegment(300, 8000);
    const filters = [
      { frequencyHz: 80, type: "highpass" },
      { frequencyHz: 250, gainDb: -6, type: "lowshelf" },
    ] as const;
    const first = applyFiltersToSegment(segment, filters);
    const second = applyFiltersToSegment(segment, filters);
    expect(first.pcm).toEqual(second.pcm);
  });

  it("does not mutate the input segment", () => {
    const segment = sineSegment(300, 8000);
    const copy = Int16Array.from(segment.pcm);
    applyFiltersToSegment(segment, [{ frequencyHz: 80, type: "highpass" }]);
    expect(segment.pcm).toEqual(copy);
  });

  it("skips filters at or above Nyquist instead of going unstable", () => {
    const segment = sineSegment(300, 8000);
    const filtered = applyFiltersToSegment(segment, [
      { frequencyHz: SAMPLE_RATE, type: "highpass" },
    ]);
    expect(filtered).toBe(segment);
  });

  it("returns the segment untouched for an empty filter list", () => {
    const segment = sineSegment(300, 8000);
    expect(applyFiltersToSegment(segment, [])).toBe(segment);
  });
});

describe("validateFilters", () => {
  it("accepts undefined and well-formed filters", () => {
    expect(() => validateFilters(undefined)).not.toThrow();
    expect(() =>
      validateFilters([
        { frequencyHz: 80, type: "highpass" },
        { frequencyHz: 250, gainDb: -6, type: "lowshelf" },
      ])
    ).not.toThrow();
  });

  it("rejects non-positive or non-finite frequencies", () => {
    expect(() =>
      validateFilters([{ frequencyHz: 0, type: "highpass" }])
    ).toThrow(RangeError);
    expect(() =>
      validateFilters([{ frequencyHz: Number.NaN, type: "highpass" }])
    ).toThrow(RangeError);
  });

  it("rejects non-finite shelf gain", () => {
    expect(() =>
      validateFilters([
        {
          frequencyHz: 250,
          gainDb: Number.POSITIVE_INFINITY,
          type: "lowshelf",
        },
      ])
    ).toThrow(RangeError);
  });
});
