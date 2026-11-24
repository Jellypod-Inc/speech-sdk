import { describe, expect, it } from "vitest";
import { isWavWithoutSamples, wrapPcm16Mono } from "../audio-utils.js";

describe("isWavWithoutSamples", () => {
  it("detects a header-only WAV and accepts one with samples", async () => {
    expect(
      isWavWithoutSamples(await wrapPcm16Mono(new Uint8Array(), 24_000))
    ).toBe(true);
    expect(
      isWavWithoutSamples(await wrapPcm16Mono(new Uint8Array(4), 24_000))
    ).toBe(false);
  });

  it("finds the data chunk after other chunks", async () => {
    const wav = await wrapPcm16Mono(new Uint8Array(4), 24_000);
    const list = new Uint8Array([
      ...new TextEncoder().encode("LIST"),
      3,
      0,
      0,
      0,
      1,
      2,
      3,
      0,
    ]);
    const withList = new Uint8Array([
      ...wav.subarray(0, 36),
      ...list,
      ...wav.subarray(36),
    ]);
    expect(isWavWithoutSamples(withList)).toBe(false);
  });

  it("ignores anything that is not a WAV", () => {
    expect(isWavWithoutSamples(new Uint8Array())).toBe(false);
    expect(isWavWithoutSamples(new Uint8Array([0xff, 0xfb, 0x90, 0x00]))).toBe(
      false
    );
  });
});
