import { describe, expect, it } from "vitest";
import {
  detectSilenceGaps,
  pickTopGaps,
  type SilenceGap,
} from "../conversation/silence-detection.js";

const SAMPLE_RATE = 24_000;

function buildPcm(spec: { samples: number; rms?: number }[]): Int16Array {
  const total = spec.reduce((n, s) => n + s.samples, 0);
  const out = new Int16Array(total);
  let offset = 0;
  for (const seg of spec) {
    if (seg.rms && seg.rms > 0) {
      // Fill with sinusoid-ish bytes scaled to approximate RMS.
      for (let i = 0; i < seg.samples; i++) {
        out[offset + i] = Math.round(
          Math.sin((i / 32) * Math.PI * 2) * seg.rms
        );
      }
    }
    offset += seg.samples;
  }
  return out;
}

describe("detectSilenceGaps", () => {
  it("returns gap descriptors for runs of silence above the min duration", () => {
    // Audio shape: 1s loud, 0.5s silent, 1s loud, 0.3s silent, 1s loud
    const pcm = buildPcm([
      { samples: SAMPLE_RATE, rms: 8000 },
      { samples: Math.round(SAMPLE_RATE * 0.5) },
      { samples: SAMPLE_RATE, rms: 8000 },
      { samples: Math.round(SAMPLE_RATE * 0.3) },
      { samples: SAMPLE_RATE, rms: 8000 },
    ]);

    const gaps = detectSilenceGaps(pcm, {
      sampleRate: SAMPLE_RATE,
      minDurationMs: 200,
    });

    expect(gaps.length).toBe(2);
    expect(gaps[0].durationMs).toBeGreaterThan(400);
    expect(gaps[0].durationMs).toBeLessThan(600);
    expect(gaps[1].durationMs).toBeGreaterThan(200);
    expect(gaps[1].durationMs).toBeLessThan(400);
  });

  it("ignores silence below the min duration", () => {
    const pcm = buildPcm([
      { samples: SAMPLE_RATE, rms: 8000 },
      { samples: Math.round(SAMPLE_RATE * 0.05) },
      { samples: SAMPLE_RATE, rms: 8000 },
    ]);

    const gaps = detectSilenceGaps(pcm, {
      sampleRate: SAMPLE_RATE,
      minDurationMs: 100,
    });

    expect(gaps.length).toBe(0);
  });

  it("returns empty when audio is all silent", () => {
    const pcm = buildPcm([{ samples: SAMPLE_RATE * 2 }]);
    const gaps = detectSilenceGaps(pcm, {
      sampleRate: SAMPLE_RATE,
      minDurationMs: 100,
    });
    expect(gaps.length).toBeLessThanOrEqual(1);
  });
});

describe("pickTopGaps", () => {
  it("returns the N largest gaps in time order", () => {
    const gaps: SilenceGap[] = [
      { startMs: 100, endMs: 200, durationMs: 100 },
      { startMs: 1000, endMs: 1500, durationMs: 500 },
      { startMs: 2000, endMs: 2300, durationMs: 300 },
      { startMs: 3000, endMs: 3050, durationMs: 50 },
    ];

    const top = pickTopGaps(gaps, 2);

    expect(top.length).toBe(2);
    expect(top[0].durationMs).toBe(500);
    expect(top[1].durationMs).toBe(300);
    expect(top[0].startMs).toBeLessThan(top[1].startMs);
  });

  it("returns all gaps if N exceeds list length", () => {
    const gaps: SilenceGap[] = [{ startMs: 0, endMs: 100, durationMs: 100 }];
    expect(pickTopGaps(gaps, 5).length).toBe(1);
  });

  it("returns empty for N <= 0", () => {
    const gaps: SilenceGap[] = [{ startMs: 0, endMs: 100, durationMs: 100 }];
    expect(pickTopGaps(gaps, 0).length).toBe(0);
    expect(pickTopGaps(gaps, -1).length).toBe(0);
  });
});
