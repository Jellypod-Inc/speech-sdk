import { describe, expect, it, vi } from "vitest";
import { ConversationTimestampAttributionError } from "../errors.js";
import { generateConversation } from "../generate-conversation.js";
import type { SpeechProvider } from "../speech-provider.js";
import type { SpeechToTextProvider } from "../speech-to-text-provider.js";
import type { WordTimestamp } from "../timestamps.js";

// A turn of length 2400 int16 samples at 24 kHz = 0.1s of silence.
const TURN_SAMPLES = 2400;
const TURN_DURATION_SEC = TURN_SAMPLES / 24_000;

const ATTRIBUTION_FAILED_RE = /Failed to attribute timestamps/;

function stitchTTS(options: {
  id: string;
  /** Word timestamps this provider returns when asked. */
  timestamps?: WordTimestamp[];
  /** Declare this model as native or derived in the feature list. */
  feature?: "native" | "derived";
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
        features: options.feature
          ? [{ id: "timestamps", mode: options.feature }]
          : [],
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
  feature?: "native" | "derived";
}): SpeechProvider {
  return {
    id: "native",
    defaultModel: "m",
    models: [
      {
        id: "m",
        releaseDate: "2025-01-01",
        languages: ["en"],
        features: options.feature
          ? [{ id: "timestamps", mode: options.feature }]
          : [],
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
    dialogueCapabilities: () => ({ minVoices: 1, maxVoices: 10 }),
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
    // Two turns, each 0.1s, gap of 200ms between them.
    // Turn 0 starts at 0s, Turn 1 starts at 0.1s + 0.2s = 0.3s.
    const providerA = stitchTTS({
      id: "a",
      feature: "native",
      timestamps: [{ text: "Hi", start: 0, end: 0.05 }],
    });
    const providerB = stitchTTS({
      id: "b",
      feature: "native",
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
      timestamps: "auto",
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
      feature: "native",
      timestamps: [{ text: "Hi", start: 0, end: 0.05 }],
    });

    const result = await generateConversation({
      turns: [
        { model: { provider, modelId: "m" }, voice: "v1", text: "Hi" },
        { model: { provider, modelId: "m" }, voice: "v2", text: "yo" },
      ],
      timestamps: "off",
    });

    expect(result.timestamps).toBeUndefined();
    // Both generate() calls passed includeTimestamps: false.
    for (const call of (provider.generate as ReturnType<typeof vi.fn>).mock
      .calls) {
      expect(call[0].includeTimestamps).toBe(false);
    }
  });

  it("auto mode with a non-timestamped turn: returns undefined (all-or-nothing)", async () => {
    const providerWithTs = stitchTTS({
      id: "a",
      feature: "native",
      timestamps: [{ text: "Hi", start: 0, end: 0.05 }],
    });
    const providerWithoutTs = stitchTTS({ id: "b" }); // no TIMESTAMPS feature

    const result = await generateConversation({
      turns: [
        {
          model: { provider: providerWithTs, modelId: "m" },
          voice: "v1",
          text: "Hi",
        },
        {
          model: { provider: providerWithoutTs, modelId: "m" },
          voice: "v2",
          text: "yo",
        },
      ],
      timestamps: "auto",
    });

    expect(result.timestamps).toBeUndefined();
  });

  it("on mode: derives timestamps via user-supplied STT for providers without native support", async () => {
    const providerDerived = stitchTTS({ id: "d", feature: "derived" });
    const stt = mockSTT([{ text: "hello", start: 0, end: 0.05 }]);

    const result = await generateConversation({
      turns: [
        {
          model: { provider: providerDerived, modelId: "m" },
          voice: "v1",
          text: "hi",
        },
        {
          model: { provider: providerDerived, modelId: "m" },
          voice: "v2",
          text: "yo",
        },
      ],
      timestamps: "on",
      timestampProvider: { provider: stt, modelId: "m" },
      gapMs: 100,
    });

    // Each turn is transcribed once (two turns, two STT calls).
    expect(stt.transcribe).toHaveBeenCalledTimes(2);
    // Flat concat with offsetting: turn 0 word + turn 1 word at offset.
    expect(result.timestamps).toHaveLength(2);
    expect(result.timestamps?.[0]).toEqual({
      text: "hello",
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
      feature: "native",
      timestamps: [
        { text: "Hi", start: 0, end: 0.05 },
        { text: "there", start: 0.06, end: 0.09 },
      ],
    });
    const providerB = stitchTTS({
      id: "b",
      feature: "native",
      timestamps: [{ text: "Hello!", start: 0.01, end: 0.05 }],
    });
    const providerC = stitchTTS({
      id: "c",
      feature: "native",
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
      timestamps: "auto",
    });

    expect(result.timestamps).toHaveLength(6);
    // Turn 0 — two words.
    expect(result.timestamps?.[0]?.turnIndex).toBe(0);
    expect(result.timestamps?.[1]?.turnIndex).toBe(0);
    // Turn 1 — one word.
    expect(result.timestamps?.[2]?.turnIndex).toBe(1);
    // Turn 2 — three words.
    expect(result.timestamps?.[3]?.turnIndex).toBe(2);
    expect(result.timestamps?.[4]?.turnIndex).toBe(2);
    expect(result.timestamps?.[5]?.turnIndex).toBe(2);
  });
});

describe("generateConversation timestamps — native path", () => {
  it("passthrough when the dialogue provider returns native alignment", async () => {
    const provider = nativeTTS({
      feature: "native",
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
      timestamps: "on",
      normalizeVolume: false, // skip the decode path for MP3 response
    });

    expect(result.timestamps).toEqual([
      { text: "Hello", start: 0, end: 0.3, turnIndex: 0 },
      { text: "there", start: 0.35, end: 0.7, turnIndex: 1 },
    ]);
  });

  it("on mode: falls back to STT on the mixed audio when the dialogue provider doesn't return alignment", async () => {
    const provider = nativeTTS({ feature: "derived" });
    const stt = mockSTT([
      { text: "Hello", start: 0, end: 0.3 },
      { text: "there", start: 0.35, end: 0.7 },
    ]);

    const result = await generateConversation({
      model: { provider, modelId: "m" },
      turns: [
        { voice: "a", text: "Hello" },
        { voice: "b", text: "there" },
      ],
      timestamps: "on",
      timestampProvider: { provider: stt, modelId: "m" },
      normalizeVolume: false,
    });

    expect(stt.transcribe).toHaveBeenCalledOnce();
    expect(result.timestamps).toHaveLength(2);
    expect(result.timestamps?.[0]?.text).toBe("Hello");
  });

  it("auto mode: no native feature, no STT fallback — returns undefined", async () => {
    const provider = nativeTTS({ feature: "derived" });

    const result = await generateConversation({
      model: { provider, modelId: "m" },
      turns: [
        { voice: "a", text: "Hello" },
        { voice: "b", text: "there" },
      ],
      timestamps: "auto",
      normalizeVolume: false,
    });

    expect(result.timestamps).toBeUndefined();
  });

  it("off mode: never populates timestamps even when native is available", async () => {
    const provider = nativeTTS({
      feature: "native",
      timestamps: [{ text: "Hi", start: 0, end: 0.1 }],
    });

    const result = await generateConversation({
      model: { provider, modelId: "m" },
      turns: [
        { voice: "a", text: "Hi" },
        { voice: "b", text: "yo" },
      ],
      timestamps: "off",
      normalizeVolume: false,
    });

    expect(result.timestamps).toBeUndefined();
    const call = (provider.generateDialogue as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as { includeTimestamps?: boolean };
    expect(call.includeTimestamps).toBe(false);
  });

  it("attribution: text-matches a multi-word native dialogue alignment back to turns", async () => {
    const provider = nativeTTS({
      feature: "native",
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
      timestamps: "on",
      normalizeVolume: false,
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
    // Provider returns "Hello," with capital H + comma; input is "hello".
    // Provider also returns "WORLD!" for input "world".
    const provider = nativeTTS({
      feature: "native",
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
      timestamps: "on",
      normalizeVolume: false,
    });

    expect(result.timestamps).toHaveLength(2);
    expect(result.timestamps?.[0]?.turnIndex).toBe(0);
    expect(result.timestamps?.[1]?.turnIndex).toBe(1);
  });

  it("attribution: throws ConversationTimestampAttributionError when provider words don't match input transcript", async () => {
    // Provider returns words completely unrelated to the input transcript.
    const provider = nativeTTS({
      feature: "native",
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
        timestamps: "on",
        normalizeVolume: false,
      })
    ).rejects.toThrow(ConversationTimestampAttributionError);

    await expect(
      generateConversation({
        model: { provider, modelId: "m" },
        turns: [
          { voice: "a", text: "Hello there." },
          { voice: "b", text: "How are you?" },
        ],
        timestamps: "on",
        normalizeVolume: false,
      })
    ).rejects.toThrow(ATTRIBUTION_FAILED_RE);
  });
});
