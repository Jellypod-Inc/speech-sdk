import { describe, expect, it, vi } from "vitest";
import {
  GatewayTimestampsUnavailableError,
  TimestampFallbackNotConfiguredError,
} from "../errors.js";
import { generateSpeech } from "../generate-speech.js";
import { alignmentToWordTimestamps } from "../providers/elevenlabs/alignment.js";
import type { SpeechProvider } from "../speech-provider.js";
import type { SpeechToTextProvider } from "../speech-to-text-provider.js";
import type { WordTimestamp } from "../timestamps.js";

function createTTSProvider(
  overrides: Partial<{
    audio: Uint8Array;
    id: string;
    mediaType: string;
    timestamps: WordTimestamp[];
    feature: "timestamps" | undefined;
    captureIncludeTimestamps: (v: boolean | undefined) => void;
  }> = {}
): SpeechProvider {
  const generate = vi
    .fn()
    .mockImplementation((opts: { includeTimestamps?: boolean }) => {
      overrides.captureIncludeTimestamps?.(opts.includeTimestamps);
      return Promise.resolve({
        audio: overrides.audio ?? new Uint8Array([1, 2, 3]),
        mediaType: overrides.mediaType ?? "audio/mpeg",
        ...(opts.includeTimestamps && overrides.timestamps
          ? { timestamps: overrides.timestamps }
          : {}),
      });
    });

  return {
    id: overrides.id ?? "test-tts",
    defaultModel: "t-model",
    models: [
      {
        id: "t-model",
        releaseDate: "2025-01-01",
        languages: ["en"],
        features: overrides.feature ? [overrides.feature] : [],
      },
    ],
    generate,
  };
}

function createSTTProvider(
  words: WordTimestamp[] = [],
  id = "mock-stt"
): SpeechToTextProvider & { transcribe: ReturnType<typeof vi.fn> } {
  const transcribe = vi.fn().mockResolvedValue({
    timestamps: words,
    text: words.map((w) => w.text).join(" "),
  });
  return {
    id,
    defaultModel: "m",
    models: [{ id: "m", releaseDate: "2025-01-01", languages: ["en"] }],
    transcribe,
  };
}

describe("generateSpeech timestamps option", () => {
  it('default ("off"): never asks the provider for timestamps, even when the model is native', async () => {
    let captured: boolean | undefined;
    const provider = createTTSProvider({
      feature: "timestamps",
      timestamps: [{ text: "Hi", start: 0, end: 0.3 }],
      captureIncludeTimestamps: (v) => {
        captured = v;
      },
    });
    const result = await generateSpeech({
      model: { provider, modelId: "t-model" },
      text: "Hi",
      voice: "v",
    });

    expect(captured).toBe(false);
    expect(result.timestamps).toBeUndefined();
  });

  it("off mode: never passes includeTimestamps and never returns timestamps", async () => {
    let captured: boolean | undefined;
    const provider = createTTSProvider({
      feature: "timestamps",
      timestamps: [{ text: "Hi", start: 0, end: 0.3 }],
      captureIncludeTimestamps: (v) => {
        captured = v;
      },
    });
    const result = await generateSpeech({
      model: { provider, modelId: "t-model" },
      text: "Hi",
      voice: "v",
      timestamps: "off",
    });

    expect(captured).toBe(false);
    expect(result.timestamps).toBeUndefined();
  });

  it("on mode: native provider returns timestamps without calling STT", async () => {
    const provider = createTTSProvider({
      feature: "timestamps",
      timestamps: [{ text: "Yo", start: 0, end: 0.1 }],
    });
    const stt = createSTTProvider([{ text: "DERIVED", start: 0, end: 1 }]);

    const result = await generateSpeech({
      model: { provider, modelId: "t-model" },
      text: "Yo",
      voice: "v",
      timestamps: "on",
      timestampFallback: { provider: stt, modelId: "m" },
    });

    expect(stt.transcribe).not.toHaveBeenCalled();
    expect(result.timestamps).toEqual([{ text: "Yo", start: 0, end: 0.1 }]);
  });

  it("on mode: provider without native timestamps falls back to user-supplied STT", async () => {
    const provider = createTTSProvider({});
    const stt = createSTTProvider([
      { text: "Hello", start: 0, end: 0.4 },
      { text: "world", start: 0.45, end: 0.9 },
    ]);

    const result = await generateSpeech({
      model: { provider, modelId: "t-model" },
      text: "Hello world",
      voice: "v",
      timestamps: "on",
      timestampFallback: { provider: stt, modelId: "m" },
    });

    expect(stt.transcribe).toHaveBeenCalledOnce();
    expect(result.timestamps).toHaveLength(2);
    expect(result.timestamps?.[0]?.text).toBe("Hello");
  });

  it("on mode: asks the gateway for server-side timestamps before STT fallback", async () => {
    let captured: boolean | undefined;
    const provider = createTTSProvider({
      id: "speech-gateway",
      timestamps: [{ text: "Hello", start: 0, end: 0.4 }],
      captureIncludeTimestamps: (v) => {
        captured = v;
      },
    });
    const stt = createSTTProvider([{ text: "DERIVED", start: 0, end: 1 }]);

    const result = await generateSpeech({
      model: { provider, modelId: "openai/tts-1" },
      text: "Hello",
      voice: "v",
      timestamps: "on",
      timestampFallback: { provider: stt, modelId: "m" },
    });

    expect(captured).toBe(true);
    expect(stt.transcribe).not.toHaveBeenCalled();
    expect(result.timestamps).toEqual([{ text: "Hello", start: 0, end: 0.4 }]);
  });

  it("on mode: never runs client-side STT fallback for gateway requests", async () => {
    const provider = createTTSProvider({ id: "speech-gateway" });
    const stt = createSTTProvider([{ text: "DERIVED", start: 0, end: 1 }]);

    await expect(
      generateSpeech({
        model: { provider, modelId: "openai/tts-1" },
        text: "Hello",
        voice: "v",
        timestamps: "on",
        timestampFallback: { provider: stt, modelId: "m" },
      })
    ).rejects.toThrow(GatewayTimestampsUnavailableError);

    expect(stt.transcribe).not.toHaveBeenCalled();
  });

  it('throws TimestampFallbackNotConfiguredError when timestamps:"on" and no fallback configured', async () => {
    const fakeBytes = new Uint8Array([65]);
    const provider: SpeechProvider = {
      id: "stub",
      defaultModel: "m",
      models: [
        { id: "m", releaseDate: "2025-01-01", languages: ["en"], features: [] },
      ],
      generate: vi.fn().mockResolvedValue({
        audio: fakeBytes,
        mediaType: "audio/wav",
      }),
    };

    await expect(
      generateSpeech({
        model: { provider, modelId: "m" },
        voice: "v",
        text: "hi",
        timestamps: "on",
      })
    ).rejects.toBeInstanceOf(TimestampFallbackNotConfiguredError);
  });

  it("uses factory-configured fallbackSTT when no per-call timestampFallback is passed", async () => {
    const transcribe = vi.fn().mockResolvedValue({
      timestamps: [{ text: "hi", start: 0, end: 0.1 }],
    });
    const sttProvider: SpeechToTextProvider = {
      id: "stub-stt",
      defaultModel: "stub",
      models: [],
      transcribe,
    };

    const ttsProvider: SpeechProvider = {
      id: "stub-tts",
      defaultModel: "m",
      models: [
        { id: "m", releaseDate: "2025-01-01", languages: ["en"], features: [] },
      ],
      generate: vi.fn().mockResolvedValue({
        audio: new Uint8Array([65]),
        mediaType: "audio/wav",
      }),
    };

    const result = await generateSpeech({
      model: {
        provider: ttsProvider,
        modelId: "m",
        fallbackSTT: { provider: sttProvider, modelId: "stub" },
      },
      voice: "v",
      text: "hi",
      timestamps: "on",
    });

    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(result.timestamps).toEqual([{ text: "hi", start: 0, end: 0.1 }]);
  });

  it("per-call timestampFallback overrides factory-level fallbackSTT", async () => {
    const factoryTranscribe = vi.fn();
    const perCallTranscribe = vi.fn().mockResolvedValue({
      timestamps: [{ text: "ok", start: 0, end: 0.1 }],
    });

    const make = (
      transcribeFn: ReturnType<typeof vi.fn>
    ): SpeechToTextProvider => ({
      id: "stub-stt",
      defaultModel: "stub",
      models: [],
      transcribe: transcribeFn,
    });

    const ttsProvider: SpeechProvider = {
      id: "stub-tts",
      defaultModel: "m",
      models: [
        { id: "m", releaseDate: "2025-01-01", languages: ["en"], features: [] },
      ],
      generate: vi.fn().mockResolvedValue({
        audio: new Uint8Array([65]),
        mediaType: "audio/wav",
      }),
    };

    await generateSpeech({
      model: {
        provider: ttsProvider,
        modelId: "m",
        fallbackSTT: { provider: make(factoryTranscribe), modelId: "stub" },
      },
      voice: "v",
      text: "hi",
      timestamps: "on",
      timestampFallback: { provider: make(perCallTranscribe), modelId: "stub" },
    });

    expect(factoryTranscribe).not.toHaveBeenCalled();
    expect(perCallTranscribe).toHaveBeenCalledTimes(1);
  });
});

describe("alignmentToWordTimestamps (ElevenLabs char → word)", () => {
  it("returns [] for empty alignment", () => {
    expect(
      alignmentToWordTimestamps({
        characters: [],
        character_start_times_seconds: [],
        character_end_times_seconds: [],
      })
    ).toEqual([]);
  });

  it("splits on a single space", () => {
    const words = alignmentToWordTimestamps({
      characters: ["H", "i", " ", "y", "o"],
      character_start_times_seconds: [0, 0.05, 0.1, 0.15, 0.2],
      character_end_times_seconds: [0.05, 0.1, 0.15, 0.2, 0.25],
    });
    expect(words).toEqual([
      { text: "Hi", start: 0, end: 0.1 },
      { text: "yo", start: 0.15, end: 0.25 },
    ]);
  });

  it("handles leading and trailing whitespace", () => {
    const words = alignmentToWordTimestamps({
      characters: [" ", " ", "a", "b", " "],
      character_start_times_seconds: [0, 0.05, 0.1, 0.15, 0.2],
      character_end_times_seconds: [0.05, 0.1, 0.15, 0.2, 0.25],
    });
    expect(words).toEqual([{ text: "ab", start: 0.1, end: 0.2 }]);
  });

  it("collapses multiple consecutive whitespace characters", () => {
    const words = alignmentToWordTimestamps({
      characters: ["a", " ", " ", "\t", "b"],
      character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4],
      character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5],
    });
    expect(words).toEqual([
      { text: "a", start: 0, end: 0.1 },
      { text: "b", start: 0.4, end: 0.5 },
    ]);
  });

  it("preserves punctuation as part of the word", () => {
    const words = alignmentToWordTimestamps({
      characters: ["H", "i", "!", " ", "o", "k", "."],
      character_start_times_seconds: [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3],
      character_end_times_seconds: [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35],
    });
    expect(words).toEqual([
      { text: "Hi!", start: 0, end: 0.15 },
      { text: "ok.", start: 0.2, end: 0.35 },
    ]);
  });
});
