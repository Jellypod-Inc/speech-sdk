import { describe, expect, it, vi } from "vitest";
import { VolumeAdjustmentUnsupportedError } from "../errors.js";
import { generateSpeech } from "../generate-speech.js";
import type { SpeechProvider } from "../speech-provider.js";
import { adjustVolume } from "../volume-adjust.js";

function pcmBytes(samples: Int16Array): Uint8Array {
  return new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
}

function readWavSamples(wav: Uint8Array): {
  sampleRate: number;
  pcm: Int16Array;
} {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  let offset = 12;
  let sampleRate = 0;
  let dataStart = -1;
  let dataLen = 0;
  while (offset + 8 <= wav.byteLength) {
    const chunkId = view.getUint32(offset);
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkId === 0x66_6d_74_20) {
      sampleRate = view.getUint32(offset + 12, true);
    } else if (chunkId === 0x64_61_74_61) {
      dataStart = offset + 8;
      dataLen = chunkSize;
      break;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  const payload = wav.subarray(dataStart, dataStart + dataLen);
  const copy = new Uint8Array(payload.byteLength);
  copy.set(payload);
  return { sampleRate, pcm: new Int16Array(copy.buffer) };
}

describe("adjustVolume", () => {
  it("returns a 16-bit mono WAV at the input's native sample rate", async () => {
    const seg = new Int16Array(2400);
    seg.fill(1000);
    const wav = await adjustVolume({
      audio: pcmBytes(seg),
      mediaType: "audio/pcm;rate=24000",
      volumeDbfs: -20,
    });
    const { sampleRate, pcm } = readWavSamples(wav);
    expect(sampleRate).toBe(24_000);
    // -20 dBFS RMS target ≈ 3277. Constant-amplitude segment ⇒ all samples = 3277.
    expect(pcm[0]).toBe(3277);
    expect(pcm.length).toBe(seg.length);
  });

  it("scales louder vs. quieter targets proportionally", async () => {
    const seg = new Int16Array(1000);
    seg.fill(1000);
    const quieter = await adjustVolume({
      audio: pcmBytes(seg),
      mediaType: "audio/pcm;rate=24000",
      volumeDbfs: -26,
    });
    const louder = await adjustVolume({
      audio: pcmBytes(seg),
      mediaType: "audio/pcm;rate=24000",
      volumeDbfs: -14,
    });
    const q = readWavSamples(quieter).pcm[0];
    const l = readWavSamples(louder).pcm[0];
    expect(l).toBeGreaterThan(q);
  });

  it("decodes base64 audio strings transparently", async () => {
    const seg = new Int16Array(1000);
    seg.fill(2000);
    const bytes = pcmBytes(seg);
    let binary = "";
    for (const b of bytes) {
      binary += String.fromCharCode(b);
    }
    const wav = await adjustVolume({
      audio: btoa(binary),
      mediaType: "audio/pcm;rate=24000",
      volumeDbfs: -20,
    });
    expect(readWavSamples(wav).pcm[0]).toBe(3277);
  });
});

describe("generateSpeech with volumeDbfs", () => {
  function mockProvider(audio: Uint8Array, mediaType: string): SpeechProvider {
    return {
      id: "mock",
      defaultModel: "m",
      models: [
        {
          id: "m",
          releaseDate: "2025-01-01",
          languages: ["en"],
          features: [],
        },
      ],
      generate: vi.fn().mockResolvedValue({ audio, mediaType }),
      getStitchOptions: () => ({
        providerOptions: { format: "pcm24k" },
        mediaType: "audio/pcm;rate=24000",
      }),
    };
  }

  it("requests the provider's stitch-mode options and returns a normalized WAV", async () => {
    const seg = new Int16Array(1000);
    seg.fill(8000);
    const provider = mockProvider(pcmBytes(seg), "audio/pcm;rate=24000");

    const result = await generateSpeech({
      model: { provider, modelId: "m" },
      text: "hi",
      voice: "v",
      volumeDbfs: -20,
    });

    expect(result.audio.mediaType).toBe("audio/wav");
    const samples = readWavSamples(result.audio.uint8Array);
    expect(samples.pcm[0]).toBe(3277);

    const callArgs = (provider.generate as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(callArgs.providerOptions).toEqual({ format: "pcm24k" });
  });

  it("stitch-mode providerOptions override caller options that would break decoding", async () => {
    const provider = mockProvider(
      pcmBytes(new Int16Array(1000).fill(1)),
      "audio/pcm;rate=24000"
    );

    await generateSpeech({
      model: { provider, modelId: "m" },
      text: "hi",
      voice: "v",
      // Caller tries to override the stitch-required format — should be
      // discarded so volumeDbfs normalization doesn't silently get garbage.
      providerOptions: { format: "mp3-please", unrelated: "keep-me" },
      volumeDbfs: -20,
    });

    const callArgs = (provider.generate as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(callArgs.providerOptions).toEqual({
      format: "pcm24k",
      unrelated: "keep-me",
    });
  });

  it("throws VolumeAdjustmentUnsupportedError when provider declines stitch", async () => {
    const provider: SpeechProvider = {
      id: "mock",
      defaultModel: "m",
      models: [
        {
          id: "m",
          releaseDate: "2025-01-01",
          languages: ["en"],
          features: [],
        },
      ],
      generate: vi.fn(),
      getStitchOptions: () => undefined,
    };

    await expect(
      generateSpeech({
        model: { provider, modelId: "m" },
        text: "hi",
        voice: "v",
        volumeDbfs: -20,
      })
    ).rejects.toBeInstanceOf(VolumeAdjustmentUnsupportedError);
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it("throws VolumeAdjustmentUnsupportedError when provider has no getStitchOptions hook at all", async () => {
    const provider: SpeechProvider = {
      id: "mock",
      defaultModel: "m",
      models: [
        {
          id: "m",
          releaseDate: "2025-01-01",
          languages: ["en"],
          features: [],
        },
      ],
      generate: vi.fn(),
    };

    await expect(
      generateSpeech({
        model: { provider, modelId: "m" },
        text: "hi",
        voice: "v",
        volumeDbfs: -20,
      })
    ).rejects.toBeInstanceOf(VolumeAdjustmentUnsupportedError);
  });

  it("does not modify audio when volumeDbfs is omitted", async () => {
    const seg = new Int16Array(100);
    seg.fill(12_345);
    const provider = mockProvider(pcmBytes(seg), "audio/pcm;rate=24000");

    const result = await generateSpeech({
      model: { provider, modelId: "m" },
      text: "hi",
      voice: "v",
    });

    // Audio bytes pass through unchanged; mediaType is the provider's.
    expect(result.audio.mediaType).toBe("audio/pcm;rate=24000");
    expect(result.audio.uint8Array.byteLength).toBe(seg.byteLength);
  });
});
