import { describe, expect, it, vi } from "vitest";
import { generateConversation } from "../generate-conversation.js";
import type { SpeechProvider } from "../speech-provider.js";

const MPEG_FRAME_SYNC_BYTE_2_MASK = 0xe0;
const PCM_SAMPLE_RATE = 24_000;

function mockPcmProvider(): SpeechProvider {
  const pcm = new Int16Array(PCM_SAMPLE_RATE);
  for (let i = 0; i < pcm.length; i++) {
    pcm[i] = Math.round(
      Math.sin((i / PCM_SAMPLE_RATE) * 2 * Math.PI * 440) * 16_000
    );
  }
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
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

describe("generateConversation stitch output format", () => {
  it("returns audio/wav by default when output is omitted", async () => {
    const provider = mockPcmProvider();
    const result = await generateConversation({
      turns: [
        { model: { provider, modelId: "m" }, voice: "a", text: "hi" },
        { model: { provider, modelId: "m" }, voice: "b", text: "there" },
      ],
    });

    expect(result.audio.mediaType).toBe("audio/wav");
    const bytes = result.audio.uint8Array;
    expect(bytes[0]).toBe("R".charCodeAt(0));
    expect(bytes[1]).toBe("I".charCodeAt(0));
    expect(bytes[2]).toBe("F".charCodeAt(0));
    expect(bytes[3]).toBe("F".charCodeAt(0));
    expect(bytes[8]).toBe("W".charCodeAt(0));
    expect(bytes[9]).toBe("A".charCodeAt(0));
    expect(bytes[10]).toBe("V".charCodeAt(0));
    expect(bytes[11]).toBe("E".charCodeAt(0));
  });

  it("returns audio/wav when output.format is wav", async () => {
    const provider = mockPcmProvider();
    const result = await generateConversation({
      turns: [
        { model: { provider, modelId: "m" }, voice: "a", text: "hi" },
        { model: { provider, modelId: "m" }, voice: "b", text: "there" },
      ],
      output: { format: "wav" },
    });

    expect(result.audio.mediaType).toBe("audio/wav");
    const bytes = result.audio.uint8Array;
    expect(bytes[0]).toBe("R".charCodeAt(0));
    expect(bytes[1]).toBe("I".charCodeAt(0));
    expect(bytes[2]).toBe("F".charCodeAt(0));
    expect(bytes[3]).toBe("F".charCodeAt(0));
    expect(bytes[8]).toBe("W".charCodeAt(0));
    expect(bytes[9]).toBe("A".charCodeAt(0));
    expect(bytes[10]).toBe("V".charCodeAt(0));
    expect(bytes[11]).toBe("E".charCodeAt(0));
  });

  it("returns audio/pcm;rate=24000 when output.format is pcm", async () => {
    const provider = mockPcmProvider();
    const result = await generateConversation({
      turns: [
        { model: { provider, modelId: "m" }, voice: "a", text: "hi" },
        { model: { provider, modelId: "m" }, voice: "b", text: "there" },
      ],
      output: { format: "pcm" },
    });

    expect(result.audio.mediaType).toBe(`audio/pcm;rate=${PCM_SAMPLE_RATE}`);
    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
  });

  it("returns audio/mpeg with valid MPEG frame sync when output.format is mp3", async () => {
    const provider = mockPcmProvider();
    const result = await generateConversation({
      turns: [
        { model: { provider, modelId: "m" }, voice: "a", text: "hi" },
        { model: { provider, modelId: "m" }, voice: "b", text: "there" },
      ],
      output: { format: "mp3", bitrate: 96 },
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

  it("rejects invalid output shape at the boundary before any provider call", async () => {
    const provider = mockPcmProvider();
    await expect(
      generateConversation({
        turns: [{ model: { provider, modelId: "m" }, voice: "a", text: "hi" }],
        output: { format: "wav", bitrate: 96 } as never,
      })
    ).rejects.toThrow(/bitrate is only valid/i);
    expect(provider.generate).not.toHaveBeenCalled();
  });
});
