import { describe, expect, it, vi } from "vitest";
import { runStitch } from "../conversation/stitch.js";
import type { ResolvedModel, SpeechProvider } from "../speech-provider.js";

function mockProvider(audioPayload: Int16Array): SpeechProvider {
  const bytes = new Uint8Array(
    audioPayload.buffer,
    audioPayload.byteOffset,
    audioPayload.byteLength
  );
  return {
    id: "mock",
    defaultModel: "m",
    models: [],
    generate: vi.fn().mockResolvedValue({
      audio: bytes,
      mediaType: "audio/pcm;rate=24000",
    }),
    getStitchOptions: () => ({
      providerOptions: { format: "pcm24k" },
      mediaType: "audio/pcm;rate=24000",
    }),
  };
}

function mockProviderAtRate(
  audioPayload: Int16Array,
  sampleRate: number
): SpeechProvider {
  const bytes = new Uint8Array(
    audioPayload.buffer,
    audioPayload.byteOffset,
    audioPayload.byteLength
  );
  return {
    id: "mock",
    defaultModel: "m",
    models: [],
    generate: vi.fn().mockResolvedValue({
      audio: bytes,
      mediaType: `audio/pcm;rate=${sampleRate}`,
    }),
    getStitchOptions: () => ({
      providerOptions: { format: `pcm${sampleRate / 1000}k` },
      mediaType: `audio/pcm;rate=${sampleRate}`,
    }),
  };
}

function readWavSampleRate(wav: Uint8Array): number {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  return view.getUint32(24, true);
}

function readWavFirstSample(wav: Uint8Array): number {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  let offset = 12;
  while (offset + 8 <= wav.byteLength) {
    const id = view.getUint32(offset);
    const size = view.getUint32(offset + 4, true);
    if (id === 0x64_61_74_61) {
      return view.getInt16(offset + 8, true);
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error("no data chunk");
}

describe("runStitch", () => {
  it("normalizes to volumeDbfs target instead of the default -20 dBFS", async () => {
    const seg = new Int16Array(2400);
    seg.fill(7);
    const provider = mockProvider(seg);
    const resolved: ResolvedModel[] = [{ provider, modelId: "m" }];

    // -14 dBFS RMS for int16 = round(32767 * 10^(-14/20)) = 6538
    const result = await runStitch({
      resolvedPerTurn: resolved,
      turns: [{ voice: "a", text: "hi" }],
      stitchOptionsPerTurn: [
        {
          providerOptions: { format: "pcm24k" },
          mediaType: "audio/pcm;rate=24000",
        },
      ],
      gapMs: 0,
      maxConcurrency: 1,
      maxRetries: 0,
      volumeDbfs: -14,
    });

    // Constant-amplitude segment ⇒ every output sample lands at the target RMS.
    expect(readWavFirstSample(result.audio)).toBe(6538);
  });

  it("calls provider.generate per turn with merged providerOptions and concats to WAV", async () => {
    const seg = new Int16Array(2400);
    seg.fill(7);
    const provider = mockProvider(seg);
    const resolved: ResolvedModel[] = [
      { provider, modelId: "m" },
      { provider, modelId: "m" },
    ];

    const result = await runStitch({
      resolvedPerTurn: resolved,
      turns: [
        { voice: "a", text: "hi", providerOptions: { pitch: 1 } },
        { voice: "b", text: "hello" },
      ],
      stitchOptionsPerTurn: [
        {
          providerOptions: { format: "pcm24k" },
          mediaType: "audio/pcm;rate=24000",
        },
        {
          providerOptions: { format: "pcm24k" },
          mediaType: "audio/pcm;rate=24000",
        },
      ],
      topLevelProviderOptions: { speed: 0.9 },
      gapMs: 300,
      maxConcurrency: 2,
      maxRetries: 0,
    });

    expect(result.audio.length).toBeGreaterThan(44);

    const calls = (provider.generate as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0].providerOptions).toEqual({
      speed: 0.9,
      pitch: 1,
      format: "pcm24k",
    });
    expect(calls[1][0].providerOptions).toEqual({
      speed: 0.9,
      format: "pcm24k",
    });

    expect(result.metadata.inputChars).toBe("hi".length + "hello".length);
  });

  it("surfaces per-turn metadata with one entry per turn", async () => {
    const seg = new Int16Array(2400);
    seg.fill(7);
    const provider = mockProvider(seg);
    const resolved: ResolvedModel[] = [
      { provider, modelId: "m" },
      { provider, modelId: "m" },
    ];

    const result = await runStitch({
      resolvedPerTurn: resolved,
      turns: [
        { voice: "a", text: "hi" },
        { voice: "b", text: "hello" },
      ],
      stitchOptionsPerTurn: [
        {
          providerOptions: { format: "pcm24k" },
          mediaType: "audio/pcm;rate=24000",
        },
        {
          providerOptions: { format: "pcm24k" },
          mediaType: "audio/pcm;rate=24000",
        },
      ],
      gapMs: 0,
      maxConcurrency: 2,
      maxRetries: 0,
    });

    expect(result.metadataPerTurn).toHaveLength(2);
    expect(result.metadataPerTurn[0].latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.metadataPerTurn[0].inputChars).toBe("hi".length);
    expect(result.metadataPerTurn[1].inputChars).toBe("hello".length);
  });

  it("uses the max per-segment rate as the stitch target (no downsample)", async () => {
    const seg = new Int16Array(4800);
    seg.fill(7);
    const provider = mockProviderAtRate(seg, 48_000);
    const resolved: ResolvedModel[] = [
      { provider, modelId: "m" },
      { provider, modelId: "m" },
    ];

    const result = await runStitch({
      resolvedPerTurn: resolved,
      turns: [
        { voice: "a", text: "hi" },
        { voice: "b", text: "hello" },
      ],
      stitchOptionsPerTurn: [
        {
          providerOptions: { format: "pcm48k" },
          mediaType: "audio/pcm;rate=48000",
        },
        {
          providerOptions: { format: "pcm48k" },
          mediaType: "audio/pcm;rate=48000",
        },
      ],
      gapMs: 0,
      maxConcurrency: 2,
      maxRetries: 0,
    });

    expect(readWavSampleRate(result.audio)).toBe(48_000);
  });
});
