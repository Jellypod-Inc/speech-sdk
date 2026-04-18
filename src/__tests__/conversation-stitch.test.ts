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

describe("runStitch", () => {
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
      normalizeVolume: false,
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
});
