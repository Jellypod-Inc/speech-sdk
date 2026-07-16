import { describe, expect, it, vi } from "vitest";
import {
  TimestampProviderRequiredError,
  TimestampValidationError,
} from "../errors.js";
import { generateConversation } from "../generate-conversation.js";
import type { SpeechProvider } from "../speech-provider.js";
import type { SpeechToTextProvider } from "../speech-to-text-provider.js";
import type { WordTimestamp } from "../timestamps.js";

// 2400 int16 samples at 24 kHz = 0.1s of silence.
const TURN_SAMPLES = 2400;
const TURN_DURATION_SEC = TURN_SAMPLES / 24_000;

function stitchTTS(options: {
  id: string;
  timestamps?: WordTimestamp[];
  feature?: "timestamps";
}): SpeechProvider {
  const pcm = new Int16Array(TURN_SAMPLES);
  const bytes = new Uint8Array(pcm.buffer);
  return {
    id: options.id,
    defaultModel: "m",
    models: [
      {
        id: "m",
        releaseDate: "2025-01-01",
        languages: ["en"],
        features: options.feature ? [options.feature] : [],
      },
    ],
    generate: vi
      .fn()
      .mockImplementation((opts: { includeTimestamps?: boolean }) =>
        Promise.resolve({
          audio: bytes,
          mediaType: "audio/pcm;rate=24000",
          ...(opts.includeTimestamps && options.timestamps
            ? { timestamps: options.timestamps }
            : {}),
        })
      ),
    getStitchOptions: () => ({
      providerOptions: { response_format: "pcm" },
      mediaType: "audio/pcm;rate=24000",
    }),
  };
}

function nativeTTS(options: {
  timestamps?: WordTimestamp[];
  feature?: "timestamps";
}): SpeechProvider {
  return {
    id: "native",
    defaultModel: "m",
    models: [
      {
        id: "m",
        releaseDate: "2025-01-01",
        languages: ["en"],
        features: options.feature ? [options.feature] : [],
      },
    ],
    generate: vi.fn(),
    generateDialogue: vi
      .fn()
      .mockImplementation((opts: { includeTimestamps?: boolean }) =>
        Promise.resolve({
          audio: new Uint8Array([1, 2, 3, 4]),
          mediaType: "audio/mpeg",
          ...(opts.includeTimestamps && options.timestamps
            ? { timestamps: options.timestamps }
            : {}),
        })
      ),
    dialogueCapabilities: () => ({ maxVoices: 10 }),
  };
}

function mockSTT(
  words: WordTimestamp[]
): SpeechToTextProvider & { transcribe: ReturnType<typeof vi.fn> } {
  const transcribe = vi.fn().mockResolvedValue({
    timestamps: words,
    text: words.map((w) => w.text).join(" "),
  });
  return {
    id: "mock-stt",
    defaultModel: "m",
    models: [{ id: "m", releaseDate: "2025-01-01", languages: ["en"] }],
    transcribe,
  };
}

describe("generateConversation timestamps — stitch path", () => {
  it("offsets per-turn timestamps by cumulative duration + gaps", async () => {
    const providerA = stitchTTS({
      id: "a",
      feature: "timestamps",
      timestamps: [{ text: "Hi", start: 0, end: 0.05 }],
    });
    const providerB = stitchTTS({
      id: "b",
      feature: "timestamps",
      timestamps: [{ text: "yo", start: 0.01, end: 0.08 }],
    });

    const result = await generateConversation({
      turns: [
        {
          model: { provider: providerA, modelId: "m" },
          voice: "v1",
          text: "Hi",
        },
        {
          model: { provider: providerB, modelId: "m" },
          voice: "v2",
          text: "yo",
        },
      ],
      gapMs: 200,
      timestamps: true,
    });

    expect(result.timestamps).toHaveLength(2);
    expect(result.timestamps?.[0]).toEqual({
      text: "Hi",
      start: 0,
      end: 0.05,
      turnIndex: 0,
    });
    expect(result.timestamps?.[1]?.text).toBe("yo");
    expect(result.timestamps?.[1]?.turnIndex).toBe(1);
    expect(result.timestamps?.[1]?.start).toBeCloseTo(
      0.01 + TURN_DURATION_SEC + 0.2,
      6
    );
    expect(result.timestamps?.[1]?.end).toBeCloseTo(
      0.08 + TURN_DURATION_SEC + 0.2,
      6
    );
  });

  it("off mode: does not request timestamps and returns undefined", async () => {
    const provider = stitchTTS({
      id: "a",
      feature: "timestamps",
      timestamps: [{ text: "Hi", start: 0, end: 0.05 }],
    });

    const result = await generateConversation({
      turns: [
        { model: { provider, modelId: "m" }, voice: "v1", text: "Hi" },
        { model: { provider, modelId: "m" }, voice: "v2", text: "yo" },
      ],
      timestamps: false,
    });

    expect(result.timestamps).toBeUndefined();
    for (const call of (provider.generate as ReturnType<typeof vi.fn>).mock
      .calls) {
      expect(call[0].includeTimestamps).toBe(false);
    }
  });

  it("on mode: derives timestamps via factory-configured STT for providers without native support", async () => {
    const stt = mockSTT([]);
    stt.transcribe.mockImplementation((options: { text?: string }) =>
      Promise.resolve({
        timestamps: [{ text: options.text ?? "", start: 0, end: 0.05 }],
      })
    );
    const providerDerived = stitchTTS({ id: "d" });

    const result = await generateConversation({
      turns: [
        {
          model: {
            provider: providerDerived,
            modelId: "m",
            fallbackSTT: { provider: stt, modelId: "m" },
          },
          voice: "v1",
          text: "hi",
        },
        {
          model: {
            provider: providerDerived,
            modelId: "m",
            fallbackSTT: { provider: stt, modelId: "m" },
          },
          voice: "v2",
          text: "yo",
        },
      ],
      timestamps: true,
      gapMs: 100,
    });

    expect(stt.transcribe).toHaveBeenCalledTimes(2);
    expect(result.timestamps).toHaveLength(2);
    expect(result.timestamps?.[0]).toEqual({
      text: "hi",
      start: 0,
      end: 0.05,
      turnIndex: 0,
    });
    expect(result.timestamps?.[1]?.turnIndex).toBe(1);
    expect(result.timestamps?.[1]?.start).toBeCloseTo(
      0 + TURN_DURATION_SEC + 0.1,
      5
    );
  });

  it("3-turn conversation: emits correct turnIndex for each word", async () => {
    const providerA = stitchTTS({
      id: "a",
      feature: "timestamps",
      timestamps: [
        { text: "Hi", start: 0, end: 0.05 },
        { text: "there", start: 0.06, end: 0.09 },
      ],
    });
    const providerB = stitchTTS({
      id: "b",
      feature: "timestamps",
      timestamps: [{ text: "Hello!", start: 0.01, end: 0.05 }],
    });
    const providerC = stitchTTS({
      id: "c",
      feature: "timestamps",
      timestamps: [
        { text: "How", start: 0, end: 0.03 },
        { text: "are", start: 0.04, end: 0.06 },
        { text: "you?", start: 0.07, end: 0.09 },
      ],
    });

    const result = await generateConversation({
      turns: [
        {
          model: { provider: providerA, modelId: "m" },
          voice: "v1",
          text: "Hi there",
        },
        {
          model: { provider: providerB, modelId: "m" },
          voice: "v2",
          text: "Hello!",
        },
        {
          model: { provider: providerC, modelId: "m" },
          voice: "v3",
          text: "How are you?",
        },
      ],
      gapMs: 100,
      timestamps: true,
    });

    expect(result.timestamps).toHaveLength(6);
    expect(result.timestamps?.[0]?.turnIndex).toBe(0);
    expect(result.timestamps?.[1]?.turnIndex).toBe(0);
    expect(result.timestamps?.[2]?.turnIndex).toBe(1);
    expect(result.timestamps?.[3]?.turnIndex).toBe(2);
    expect(result.timestamps?.[4]?.turnIndex).toBe(2);
    expect(result.timestamps?.[5]?.turnIndex).toBe(2);
  });

  it("rejects missing turn timestamps instead of fabricating proportional timings", async () => {
    const providerWithTimestamps = stitchTTS({
      id: "with-ts",
      feature: "timestamps",
      timestamps: [{ text: "hello", start: 0, end: 0.05 }],
    });
    const providerWithoutTimestamps = stitchTTS({ id: "no-ts" });
    const emptySTT = mockSTT([]);

    await expect(
      generateConversation({
        turns: [
          {
            model: { provider: providerWithTimestamps, modelId: "m" },
            voice: "v1",
            text: "hello",
          },
          {
            model: {
              provider: providerWithoutTimestamps,
              modelId: "m",
              fallbackSTT: { provider: emptySTT, modelId: "m" },
            },
            voice: "v2",
            text: "world friend",
          },
        ],
        gapMs: 100,
        timestamps: true,
      })
    ).rejects.toBeInstanceOf(TimestampValidationError);
  });

  it("requires a timestamp provider before stitch synthesis", async () => {
    const ttsProvider = stitchTTS({ id: "stub-no-fallback" });

    await expect(
      generateConversation({
        model: { provider: ttsProvider, modelId: "m" },
        turns: [
          { voice: "a", text: "Hi." },
          { voice: "b", text: "Hello." },
        ],
        timestamps: true,
      })
    ).rejects.toBeInstanceOf(TimestampProviderRequiredError);
  });
});

describe("generateConversation timestamps — native path", () => {
  it("passthrough when the dialogue provider returns native alignment", async () => {
    const provider = nativeTTS({
      feature: "timestamps",
      timestamps: [
        { text: "Hello", start: 0, end: 0.3 },
        { text: "there", start: 0.35, end: 0.7 },
      ],
    });

    const result = await generateConversation({
      model: { provider, modelId: "m" },
      turns: [
        { voice: "a", text: "Hello" },
        { voice: "b", text: "there" },
      ],
      timestamps: true,
    });

    expect(result.timestamps).toEqual([
      { text: "Hello", start: 0, end: 0.3, turnIndex: 0 },
      { text: "there", start: 0.35, end: 0.7, turnIndex: 1 },
    ]);
  });

  it("on mode: falls back to STT on the mixed audio when the dialogue provider doesn't return alignment", async () => {
    const stt = mockSTT([
      { text: "Hello", start: 0, end: 0.3 },
      { text: "there", start: 0.35, end: 0.7 },
    ]);
    const provider = nativeTTS({});

    const result = await generateConversation({
      model: {
        provider,
        modelId: "m",
        fallbackSTT: { provider: stt, modelId: "m" },
      },
      turns: [
        { voice: "a", text: "Hello" },
        { voice: "b", text: "there" },
      ],
      timestamps: true,
    });

    expect(stt.transcribe).toHaveBeenCalledOnce();
    expect(result.timestamps).toHaveLength(2);
    expect(result.timestamps?.[0]?.text).toBe("Hello");
  });

  it("forwards the combined turn text to the STT fallback for forced alignment", async () => {
    let receivedText: string | undefined;
    const stt: SpeechToTextProvider = {
      id: "align-stt",
      defaultModel: "m",
      models: [{ id: "m", releaseDate: "2025-01-01", languages: ["en"] }],
      transcribe: vi.fn().mockImplementation((opts: { text?: string }) => {
        receivedText = opts.text;
        return Promise.resolve({
          timestamps: [
            { text: "Hello", start: 0, end: 0.3 },
            { text: "there", start: 0.35, end: 0.7 },
          ],
        });
      }),
    };
    const provider = nativeTTS({});

    await generateConversation({
      model: {
        provider,
        modelId: "m",
        fallbackSTT: { provider: stt, modelId: "m" },
      },
      turns: [
        { voice: "a", text: "Hello" },
        { voice: "b", text: "there" },
      ],
      timestamps: true,
    });

    expect(receivedText).toBe("Hello there");
  });

  it("off mode: never populates timestamps even when native is available", async () => {
    const provider = nativeTTS({
      feature: "timestamps",
      timestamps: [{ text: "Hi", start: 0, end: 0.1 }],
    });

    const result = await generateConversation({
      model: { provider, modelId: "m" },
      turns: [
        { voice: "a", text: "Hi" },
        { voice: "b", text: "yo" },
      ],
      timestamps: false,
    });

    expect(result.timestamps).toBeUndefined();
    const call = (provider.generateDialogue as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as { includeTimestamps?: boolean };
    expect(call.includeTimestamps).toBe(false);
  });

  it("attribution: text-matches a multi-word native dialogue alignment back to turns", async () => {
    const provider = nativeTTS({
      feature: "timestamps",
      timestamps: [
        { text: "Hello", start: 0, end: 0.3 },
        { text: "there,", start: 0.35, end: 0.6 },
        { text: "friend.", start: 0.65, end: 0.95 },
        { text: "How", start: 1.1, end: 1.3 },
        { text: "are", start: 1.35, end: 1.5 },
        { text: "you?", start: 1.55, end: 1.8 },
      ],
    });

    const result = await generateConversation({
      model: { provider, modelId: "m" },
      turns: [
        { voice: "a", text: "Hello there, friend." },
        { voice: "b", text: "How are you?" },
      ],
      timestamps: true,
    });

    expect(result.timestamps).toHaveLength(6);
    expect(result.timestamps?.[0]?.turnIndex).toBe(0);
    expect(result.timestamps?.[1]?.turnIndex).toBe(0);
    expect(result.timestamps?.[2]?.turnIndex).toBe(0);
    expect(result.timestamps?.[3]?.turnIndex).toBe(1);
    expect(result.timestamps?.[4]?.turnIndex).toBe(1);
    expect(result.timestamps?.[5]?.turnIndex).toBe(1);
  });

  it("attribution: tolerates minor casing/punctuation differences", async () => {
    const provider = nativeTTS({
      feature: "timestamps",
      timestamps: [
        { text: "Hello,", start: 0, end: 0.3 },
        { text: "WORLD!", start: 0.35, end: 0.7 },
      ],
    });

    const result = await generateConversation({
      model: { provider, modelId: "m" },
      turns: [
        { voice: "a", text: "hello" },
        { voice: "b", text: "world" },
      ],
      timestamps: true,
    });

    expect(result.timestamps).toHaveLength(2);
    expect(result.timestamps?.[0]?.turnIndex).toBe(0);
    expect(result.timestamps?.[1]?.turnIndex).toBe(1);
  });

  it("requires a timestamp provider before native dialogue synthesis", async () => {
    const provider = nativeTTS({});

    await expect(
      generateConversation({
        model: { provider, modelId: "m" },
        turns: [
          { voice: "a", text: "Hi." },
          { voice: "b", text: "Hello." },
        ],
        timestamps: true,
      })
    ).rejects.toBeInstanceOf(TimestampProviderRequiredError);
  });

  it("rejects native dialogue timestamps that do not match the input transcript", async () => {
    const provider = nativeTTS({
      feature: "timestamps",
      timestamps: [
        { text: "completely", start: 0, end: 0.3 },
        { text: "wrong", start: 0.35, end: 0.6 },
        { text: "hallucinated", start: 0.65, end: 0.95 },
        { text: "garbage", start: 1.1, end: 1.4 },
        { text: "nonsense", start: 1.5, end: 1.8 },
      ],
    });

    await expect(
      generateConversation({
        model: { provider, modelId: "m" },
        turns: [
          { voice: "a", text: "Hello there." },
          { voice: "b", text: "How are you?" },
        ],
        timestamps: true,
      })
    ).rejects.toMatchObject({
      name: TimestampValidationError.name,
      reason: "transcript_mismatch",
    });
  });
});
