import { describe, expect, it } from "vitest";
import { timeStretch } from "../plugins/time-stretch/index.js";

describe("timeStretch", () => {
  it("returns identical sample values in a new Int16Array when speed is 1", () => {
    const input = new Int16Array([0, 1000, -1000, 32_767, -32_768]);
    const output = timeStretch(input, { speed: 1, sampleRate: 16_000 });

    expect(output).toEqual(input);
    expect(output).not.toBe(input);
  });

  it("returns exact target lengths for representative speeds", () => {
    const input = createSpeechLikeSignal(16_000, 1);

    for (const speed of [0.75, 0.8, 1.2, 1.5]) {
      const output = timeStretch(input, { speed, sampleRate: 16_000 });
      expect(output.length).toBe(Math.round(input.length / speed));
    }
  });

  it("does not mutate input", () => {
    const input = createSpeechLikeSignal(16_000, 0.25);
    const copy = input.slice();

    timeStretch(input, { speed: 1.2, sampleRate: 16_000 });

    expect(input).toEqual(copy);
  });

  it("is deterministic", () => {
    const input = createSpeechLikeSignal(24_000, 0.5);
    const first = timeStretch(input, { speed: 0.85, sampleRate: 24_000 });
    const second = timeStretch(input, { speed: 0.85, sampleRate: 24_000 });

    expect(second).toEqual(first);
  });

  it("returns empty output for empty input", () => {
    const output = timeStretch(new Int16Array(0), {
      speed: 1.2,
      sampleRate: 16_000,
    });

    expect(output).toEqual(new Int16Array(0));
  });

  it("handles very short input with exact target length", () => {
    const input = new Int16Array([0, 1200, -1200]);
    const output = timeStretch(input, { speed: 0.75, sampleRate: 16_000 });

    expect(output.length).toBe(Math.round(input.length / 0.75));
  });

  it("rejects invalid speed values", () => {
    expect(() =>
      timeStretch(new Int16Array(10), {
        speed: Number.NaN,
        sampleRate: 16_000,
      })
    ).toThrow(TypeError);
    expect(() =>
      timeStretch(new Int16Array(10), {
        speed: Number.POSITIVE_INFINITY,
        sampleRate: 16_000,
      })
    ).toThrow(TypeError);
    expect(() =>
      timeStretch(new Int16Array(10), { speed: 0.5, sampleRate: 16_000 })
    ).toThrow(RangeError);
    expect(() =>
      timeStretch(new Int16Array(10), { speed: 2, sampleRate: 16_000 })
    ).toThrow(RangeError);
  });

  it("rejects invalid sampleRate values", () => {
    expect(() =>
      timeStretch(new Int16Array(10), {
        speed: 1,
        sampleRate: Number.NaN,
      })
    ).toThrow(TypeError);
    expect(() =>
      timeStretch(new Int16Array(10), { speed: 1, sampleRate: 16_000.5 })
    ).toThrow(TypeError);
    expect(() =>
      timeStretch(new Int16Array(10), { speed: 1, sampleRate: 7999 })
    ).toThrow(RangeError);
    expect(() =>
      timeStretch(new Int16Array(10), { speed: 1, sampleRate: 48_001 })
    ).toThrow(RangeError);
  });

  it("rejects unsupported input types", () => {
    expect(() =>
      timeStretch([1, 2, 3] as never, { speed: 1, sampleRate: 16_000 })
    ).toThrow(TypeError);
  });

  it("rejects odd byte lengths", () => {
    expect(() =>
      timeStretch(new Uint8Array(3), { speed: 1, sampleRate: 16_000 })
    ).toThrow(TypeError);
  });

  it("respects Uint8Array byteOffset and byteLength", () => {
    const backing = new Uint8Array([99, 99, 1, 0, 255, 255, 0, 128, 99, 99]);
    const view = new Uint8Array(backing.buffer, 2, 6);
    const output = timeStretch(view, { speed: 1, sampleRate: 16_000 });

    expect([...output]).toEqual([1, -1, -32_768]);
  });

  it("interprets ArrayBuffer input as little-endian s16le", () => {
    const bytes = new Uint8Array([0, 0, 255, 127, 0, 128, 52, 18]);
    const output = timeStretch(bytes.buffer, { speed: 1, sampleRate: 16_000 });

    expect([...output]).toEqual([0, 32_767, -32_768, 0x12_34]);
  });

  it("rejects obvious encoded or file signatures", () => {
    const signatures = [
      new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 65, 86, 69]),
      new Uint8Array([73, 68, 51, 0]),
      new Uint8Array([79, 103, 103, 83]),
      new Uint8Array([102, 76, 97, 67]),
      new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]),
      new Uint8Array([255, 251, 0, 0, 255, 250]),
    ];

    for (const signature of signatures) {
      expect(() =>
        timeStretch(signature, { speed: 1, sampleRate: 16_000 })
      ).toThrow(TypeError);
    }
  });

  it("keeps output samples in signed 16-bit range", () => {
    const input = createSpeechLikeSignal(48_000, 0.5, 0.98);
    const output = timeStretch(input, { speed: 1.5, sampleRate: 48_000 });

    for (const sample of output) {
      expect(sample).toBeGreaterThanOrEqual(-32_768);
      expect(sample).toBeLessThanOrEqual(32_767);
    }
  });

  it("does not throw for deterministic random valid input", () => {
    const input = new Int16Array(4096);
    let state = 123_456_789;

    for (let index = 0; index < input.length; index += 1) {
      // biome-ignore lint/suspicious/noBitwiseOperators: PRNG state mask
      state = (state * 1_103_515_245 + 12_345) & 0x7f_ff_ff_ff;
      input[index] = (state % 65_536) - 32_768;
    }

    expect(() =>
      timeStretch(input, { speed: 1.1, sampleRate: 16_000 })
    ).not.toThrow();
  });
});

function createSpeechLikeSignal(
  sampleRate: number,
  seconds: number,
  amplitude = 0.55
): Int16Array {
  const length = Math.round(sampleRate * seconds);
  const output = new Int16Array(length);

  for (let index = 0; index < length; index += 1) {
    const t = index / sampleRate;
    const envelope = 0.6 + 0.4 * Math.sin(2 * Math.PI * 3 * t);
    const voiced =
      Math.sin(2 * Math.PI * 180 * t) * 0.7 +
      Math.sin(2 * Math.PI * 360 * t) * 0.2 +
      Math.sin(2 * Math.PI * 540 * t) * 0.1;
    output[index] = Math.round(voiced * envelope * amplitude * 32_767);
  }

  return output;
}
