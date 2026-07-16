import { describe, expect, it, vi } from "vitest";
import {
  TimestampProviderRequiredError,
  TimestampValidationError,
} from "../errors.js";
import { generateSpeech } from "../generate-speech.js";
import { alignmentToWordTimestamps } from "../providers/elevenlabs/alignment.js";
import type { SpeechProvider } from "../speech-provider.js";
import type { SpeechToTextProvider } from "../speech-to-text-provider.js";
import type { WordTimestamp } from "../timestamps.js";

const NON_LEXICAL_CHARACTERS = /[^\p{L}\p{N}]+/gu;
const PUNCTUATION_ONLY = /^[^\p{L}\p{N}]+$/u;

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
      timestamps: false,
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
      model: {
        provider,
        modelId: "t-model",
        fallbackSTT: { provider: stt, modelId: "m" },
      },
      text: "Yo",
      voice: "v",
      timestamps: true,
    });

    expect(stt.transcribe).not.toHaveBeenCalled();
    expect(result.timestamps).toEqual([{ text: "Yo", start: 0, end: 0.1 }]);
  });

  it("on mode: provider without native timestamps falls back to factory-configured STT", async () => {
    const provider = createTTSProvider({});
    const stt = createSTTProvider([
      { text: "Hello", start: 0, end: 0.4 },
      { text: "world", start: 0.45, end: 0.9 },
    ]);

    const result = await generateSpeech({
      model: {
        provider,
        modelId: "t-model",
        fallbackSTT: { provider: stt, modelId: "m" },
      },
      text: "Hello world",
      voice: "v",
      timestamps: true,
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
      model: {
        provider,
        modelId: "openai/tts-1",
        fallbackSTT: { provider: stt, modelId: "m" },
      },
      text: "Hello",
      voice: "v",
      timestamps: true,
    });

    expect(captured).toBe(true);
    expect(stt.transcribe).not.toHaveBeenCalled();
    expect(result.timestamps).toEqual([{ text: "Hello", start: 0, end: 0.4 }]);
  });

  it("on mode: never runs client-side STT fallback for gateway requests", async () => {
    const provider = createTTSProvider({
      id: "speech-gateway",
      timestamps: [{ text: "Hello", start: 0, end: 0.4 }],
    });
    const stt = createSTTProvider([{ text: "DERIVED", start: 0, end: 1 }]);

    const result = await generateSpeech({
      model: {
        provider,
        modelId: "openai/tts-1",
        fallbackSTT: { provider: stt, modelId: "m" },
      },
      text: "Hello",
      voice: "v",
      timestamps: true,
    });

    expect(result.audio).toBeDefined();
    expect(result.timestamps).toEqual([{ text: "Hello", start: 0, end: 0.4 }]);
    expect(stt.transcribe).not.toHaveBeenCalled();
  });

  it("requires a timestamp provider before synthesis when native timestamps are unavailable", async () => {
    const provider: SpeechProvider = {
      id: "stub",
      defaultModel: "m",
      models: [
        {
          id: "m",
          releaseDate: "2025-01-01",
          languages: ["en"],
          features: [],
        },
      ],
      generate: vi.fn().mockResolvedValue({
        audio: new Uint8Array([65]),
        mediaType: "audio/wav",
      }),
    };

    await expect(
      generateSpeech({
        model: { provider, modelId: "m" },
        voice: "v",
        text: "hi",
        timestamps: true,
      })
    ).rejects.toBeInstanceOf(TimestampProviderRequiredError);
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it("forwards the synthesized source text to the STT fallback for forced alignment", async () => {
    let receivedText: string | undefined;
    const provider = createTTSProvider({});
    const stt: SpeechToTextProvider = {
      id: "align-stt",
      defaultModel: "m",
      models: [{ id: "m", releaseDate: "2025-01-01", languages: ["en"] }],
      transcribe: vi.fn().mockImplementation((opts: { text?: string }) => {
        receivedText = opts.text;
        return Promise.resolve({
          timestamps: [
            { text: "Hello", start: 0, end: 0.4 },
            { text: "world", start: 0.45, end: 0.9 },
          ],
        });
      }),
    };

    await generateSpeech({
      model: {
        provider,
        modelId: "t-model",
        fallbackSTT: { provider: stt, modelId: "m" },
      },
      text: "Hello world",
      voice: "v",
      timestamps: true,
    });

    expect(receivedText).toBe("Hello world");
  });

  it("rejects a gateway response that omits requested timestamps", async () => {
    const provider = createTTSProvider({ id: "speech-gateway" });

    await expect(
      generateSpeech({
        model: { provider, modelId: "openai/tts-1" },
        text: "Hello",
        voice: "v",
        timestamps: true,
      })
    ).rejects.toMatchObject({
      name: TimestampValidationError.name,
      reason: "empty",
    });
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
      timestamps: true,
    });

    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(result.timestamps).toEqual([{ text: "hi", start: 0, end: 0.1 }]);
  });
});

describe("alignmentToWordTimestamps (ElevenLabs char → word)", () => {
  const alignText = (text: string) => {
    const characters = [...text];
    return {
      characters,
      character_start_times_seconds: characters.map((_, index) => index / 100),
      character_end_times_seconds: characters.map(
        (_, index) => (index + 1) / 100
      ),
    };
  };

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

  it("does not emit standalone punctuation as a word", () => {
    const words = alignmentToWordTimestamps(
      alignText("And it doesn't stop at email. Smishing -- phishing via SMS")
    );

    expect(
      words.map(({ text }) => text.replace(NON_LEXICAL_CHARACTERS, ""))
    ).toEqual([
      "And",
      "it",
      "doesnt",
      "stop",
      "at",
      "email",
      "Smishing",
      "phishing",
      "via",
      "SMS",
    ]);
    expect(words.some(({ text }) => PUNCTUATION_ONLY.test(text))).toBe(false);
    expect(words.some(({ text }) => text.includes("--"))).toBe(true);
    expect(words[6]).toEqual({ text: "Smishing --", start: 0.3, end: 0.41 });
    for (let index = 1; index < words.length; index++) {
      expect(words[index]?.start).toBeGreaterThanOrEqual(
        words[index - 1]?.end ?? 0
      );
    }
  });

  it("attaches standalone em dashes, en dashes, and ellipses to preceding words", () => {
    const words = alignmentToWordTimestamps(
      alignText("alpha — beta – gamma … delta ... epsilon")
    );

    expect(words.map(({ text }) => text)).toEqual([
      "alpha —",
      "beta –",
      "gamma …",
      "delta ...",
      "epsilon",
    ]);
  });

  it("attaches standalone commas, periods, and question marks to preceding words", () => {
    const words = alignmentToWordTimestamps(
      alignText("alpha , beta . gamma ? delta")
    );

    expect(words.map(({ text }) => text)).toEqual([
      "alpha ,",
      "beta .",
      "gamma ?",
      "delta",
    ]);
  });

  it("attaches standalone straight and smart quotation marks and apostrophes", () => {
    const words = alignmentToWordTimestamps(
      alignText('" alpha " beta “ gamma ” delta \' epsilon ’ zeta')
    );

    expect(words.map(({ text }) => text)).toEqual([
      '" alpha "',
      "beta “",
      "gamma ”",
      "delta '",
      "epsilon ’",
      "zeta",
    ]);
  });

  it("preserves contractions and hyphenated words", () => {
    const words = alignmentToWordTimestamps(
      alignText("don't can’t mother-in-law co-operate")
    );

    expect(words.map(({ text }) => text)).toEqual([
      "don't",
      "can’t",
      "mother-in-law",
      "co-operate",
    ]);
  });

  it("handles repeated whitespace and newlines", () => {
    const words = alignmentToWordTimestamps(
      alignText("alpha   \n\n\tbeta \r\n gamma")
    );

    expect(words.map(({ text }) => text)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("preserves precomposed and decomposed Unicode words", () => {
    const decomposedCafe = "cafe\u0301";
    const words = alignmentToWordTimestamps(
      alignText(`café ${decomposedCafe} Ångström`)
    );

    expect(words.map(({ text }) => text)).toEqual([
      "café",
      decomposedCafe,
      "Ångström",
    ]);
    expect(words[0]?.text.normalize("NFC")).toBe(
      words[1]?.text.normalize("NFC")
    );
  });

  it("attaches leading and trailing punctuation and omits punctuation-only input", () => {
    const words = alignmentToWordTimestamps(alignText("--- hello world !!!"));

    expect(words).toEqual([
      { text: "--- hello", start: 0, end: 0.09 },
      { text: "world !!!", start: 0.1, end: 0.19 },
    ]);
    expect(alignmentToWordTimestamps(alignText("?! — ..."))).toEqual([]);
  });

  it("preserves text without whitespace word boundaries", () => {
    const words = alignmentToWordTimestamps(alignText("你好世界。"));

    expect(words).toEqual([{ text: "你好世界。", start: 0, end: 0.05 }]);
  });
});
