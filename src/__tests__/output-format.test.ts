import { describe, expect, it, vi } from "vitest";
import { OutputConversionUnsupportedError } from "../errors.js";
import { generateSpeech } from "../generate-speech.js";
import type { SpeechProvider, StitchTurnOptions } from "../speech-provider.js";

const MPEG_FRAME_SYNC_BYTE_2_MASK = 0xe0;
const PCM_SAMPLE_RATE = 24_000;

function makePcm16Bytes(numSamples: number): Uint8Array {
  const samples = new Int16Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    samples[i] = Math.round(
      Math.sin((i / PCM_SAMPLE_RATE) * 2 * Math.PI * 440) * 16_000
    );
  }
  return new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}

interface MockOverrides {
  audio?: Uint8Array | string;
  mediaType?: string;
}

function createPcmStitchProvider(overrides?: MockOverrides): SpeechProvider {
  const pcm = makePcm16Bytes(2400);
  const stitchOpts: StitchTurnOptions = {
    mediaType: "audio/pcm;rate=24000",
    providerOptions: { response_format: "pcm" },
  };
  return {
    id: "mock-pcm",
    defaultModel: "mock-model",
    models: [],
    generate: vi.fn().mockResolvedValue({
      audio: overrides?.audio ?? pcm,
      mediaType: overrides?.mediaType ?? "audio/pcm;rate=24000",
    }),
    getStitchOptions: vi.fn().mockReturnValue(stitchOpts),
  };
}

function createMpegProvider(): SpeechProvider {
  return {
    id: "mock-mpeg",
    defaultModel: "mock-model",
    models: [],
    generate: vi.fn().mockResolvedValue({
      audio: new Uint8Array([0xff, 0xfb, 0x10, 0x00]),
      mediaType: "audio/mpeg",
    }),
  };
}

describe("generateSpeech output format", () => {
  it("preserves provider passthrough media type when output is omitted", async () => {
    const provider = createMpegProvider();
    const result = await generateSpeech({
      model: { provider, modelId: "mock-model" },
      text: "Hello",
      voice: "test",
    });

    expect(result.audio.mediaType).toBe("audio/mpeg");
  });

  it("converts to audio/wav when output.format is wav", async () => {
    const provider = createPcmStitchProvider();
    const result = await generateSpeech({
      model: { provider, modelId: "mock-model" },
      text: "Hello",
      voice: "test",
      output: { format: "wav" },
    });

    expect(result.audio.mediaType).toBe("audio/wav");
    const bytes = result.audio.uint8Array;
    expect(bytes[0]).toBe("R".charCodeAt(0));
    expect(bytes[1]).toBe("I".charCodeAt(0));
    expect(bytes[2]).toBe("F".charCodeAt(0));
    expect(bytes[3]).toBe("F".charCodeAt(0));
  });

  it("converts to audio/pcm with sample rate when output.format is pcm", async () => {
    const provider = createPcmStitchProvider();
    const result = await generateSpeech({
      model: { provider, modelId: "mock-model" },
      text: "Hello",
      voice: "test",
      output: { format: "pcm" },
    });

    expect(result.audio.mediaType).toBe(`audio/pcm;rate=${PCM_SAMPLE_RATE}`);
    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
  });

  it("converts to audio/mpeg when output.format is mp3", async () => {
    const provider = createPcmStitchProvider({
      audio: makePcm16Bytes(PCM_SAMPLE_RATE),
    });
    const result = await generateSpeech({
      model: { provider, modelId: "mock-model" },
      text: "Hello",
      voice: "test",
      output: { format: "mp3" },
    });

    expect(result.audio.mediaType).toBe("audio/mpeg");
    const bytes = result.audio.uint8Array;
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(bytes[0]).toBe(0xff);
    // biome-ignore lint/suspicious/noBitwiseOperators: MPEG frame sync needs bitmask check
    expect(bytes[1] & MPEG_FRAME_SYNC_BYTE_2_MASK).toBe(
      MPEG_FRAME_SYNC_BYTE_2_MASK
    );
  });

  it("decodes base64 string audio before converting", async () => {
    const pcm = makePcm16Bytes(1200);
    const provider = createPcmStitchProvider({
      audio: uint8ToBase64(pcm),
      mediaType: "audio/pcm;rate=24000",
    });

    const result = await generateSpeech({
      model: { provider, modelId: "mock-model" },
      text: "Hello",
      voice: "test",
      output: { format: "wav" },
    });

    expect(result.audio.mediaType).toBe("audio/wav");
    const bytes = result.audio.uint8Array;
    expect(bytes[0]).toBe("R".charCodeAt(0));
    expect(bytes[1]).toBe("I".charCodeAt(0));
    expect(bytes[2]).toBe("F".charCodeAt(0));
    expect(bytes[3]).toBe("F".charCodeAt(0));
  });

  it("rejects explicit output on a provider without getStitchOptions", async () => {
    const provider = createMpegProvider();

    await expect(
      generateSpeech({
        model: { provider, modelId: "mock-model" },
        text: "Hello",
        voice: "test",
        output: { format: "wav" },
      })
    ).rejects.toThrow(OutputConversionUnsupportedError);
  });

  it("applies volumeDbfs first then converts to the requested output", async () => {
    const provider = createPcmStitchProvider({
      audio: makePcm16Bytes(PCM_SAMPLE_RATE),
    });

    const result = await generateSpeech({
      model: { provider, modelId: "mock-model" },
      text: "Hello",
      voice: "test",
      volumeDbfs: -20,
      output: { format: "mp3" },
    });

    expect(result.audio.mediaType).toBe("audio/mpeg");
    const bytes = result.audio.uint8Array;
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(bytes[0]).toBe(0xff);
    // biome-ignore lint/suspicious/noBitwiseOperators: MPEG frame sync needs bitmask check
    expect(bytes[1] & MPEG_FRAME_SYNC_BYTE_2_MASK).toBe(
      MPEG_FRAME_SYNC_BYTE_2_MASK
    );

    const generateMock = provider.generate as unknown as ReturnType<
      typeof vi.fn
    >;
    expect(generateMock).toHaveBeenCalledTimes(1);
    const call = generateMock.mock.calls[0][0];
    expect(call.providerOptions).toEqual({ response_format: "pcm" });
  });
});
