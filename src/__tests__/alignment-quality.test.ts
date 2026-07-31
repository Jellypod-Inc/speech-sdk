import { describe, expect, it, vi } from "vitest";
import { generateSpeech } from "../generate-speech.js";
import type { ResolvedModel, SpeechProvider } from "../speech-provider.js";
import type { TimestampProvider } from "../timestamp-provider.js";
import type { WordTimestamp } from "../timestamps.js";

function ttsModel(options: {
  id?: string;
  native?: boolean;
  timestamps?: readonly WordTimestamp[];
}): ResolvedModel {
  const provider: SpeechProvider = {
    id: options.id ?? "tts",
    defaultModel: "model",
    models: [
      {
        id: "model",
        features: options.native ? ["timestamps"] : [],
        languages: ["en"],
        releaseDate: "2026-01-01",
      },
    ],
    generate: vi.fn().mockImplementation(({ includeTimestamps }) =>
      Promise.resolve({
        audio: new Uint8Array([1, 2, 3]),
        mediaType: "audio/mpeg",
        ...(includeTimestamps && options.timestamps !== undefined
          ? { timestamps: options.timestamps }
          : {}),
      })
    ),
  };
  return { provider, modelId: "model" };
}

function timestampProvider(
  timestamps: readonly WordTimestamp[]
): TimestampProvider & { align: ReturnType<typeof vi.fn> } {
  const align = vi.fn().mockResolvedValue(timestamps);
  return { align };
}

describe("exact timestamp alignment", () => {
  it("accepts native timestamps and projects caller punctuation", async () => {
    const result = await generateSpeech({
      model: ttsModel({
        native: true,
        timestamps: [
          { text: "Smishing", start: 0, end: 0.3 },
          { text: "phishing", start: 0.4, end: 0.7 },
          { text: "via", start: 0.8, end: 0.9 },
          { text: "SMS", start: 1, end: 1.2 },
        ],
      }),
      voice: "v",
      text: "Smishing -- phishing via SMS",
      timestamps: true,
    });

    expect(result.timestamps.map(({ text }) => text)).toEqual([
      "Smishing --",
      "phishing",
      "via",
      "SMS",
    ]);
  });

  it("ignores timestampProvider when native timestamps are supported", async () => {
    const provider = timestampProvider([{ text: "wrong", start: 0, end: 0.2 }]);
    const model = ttsModel({
      native: true,
      timestamps: [{ text: "hello", start: 0, end: 0.2 }],
    });

    const result = await generateSpeech({
      model,
      voice: "v",
      text: "hello",
      timestamps: true,
      timestampProvider: provider,
    });

    expect(provider.align).not.toHaveBeenCalled();
    expect(model.provider.generate).toHaveBeenCalledWith(
      expect.objectContaining({ includeTimestamps: true })
    );
    expect(result.timestamps).toEqual([{ text: "hello", start: 0, end: 0.2 }]);
  });

  it("uses timestampProvider for models without native timestamps", async () => {
    const provider = timestampProvider([{ text: "hello", start: 0, end: 0.2 }]);

    const result = await generateSpeech({
      model: ttsModel({}),
      voice: "v",
      text: "hello",
      timestamps: true,
      timestampProvider: provider,
    });

    expect(provider.align).toHaveBeenCalledWith(
      expect.objectContaining({ text: "hello" })
    );
    expect(result.timestamps).toEqual([{ text: "hello", start: 0, end: 0.2 }]);
  });

  it("falls back to timestampProvider when native coverage is invalid", async () => {
    const provider = timestampProvider([{ text: "hello", start: 0, end: 0.2 }]);
    const result = await generateSpeech({
      model: ttsModel({
        native: true,
        timestamps: [{ text: "extra", start: 0, end: 0.2 }],
      }),
      voice: "v",
      text: "hello",
      timestamps: true,
      timestampProvider: provider,
    });

    expect(provider.align).toHaveBeenCalledWith(
      expect.objectContaining({ text: "hello" })
    );
    expect(result.timestamps).toEqual([{ text: "hello", start: 0, end: 0.2 }]);
  });

  it("rejects invalid native coverage when timestampProvider also mismatches", async () => {
    await expect(
      generateSpeech({
        model: ttsModel({
          native: true,
          timestamps: [{ text: "extra", start: 0, end: 0.2 }],
        }),
        voice: "v",
        text: "hello",
        timestamps: true,
        timestampProvider: timestampProvider([
          { text: "still wrong", start: 0, end: 0.2 },
        ]),
      })
    ).rejects.toMatchObject({
      reason: "transcript_mismatch",
      source: "timestampProvider",
    });
  });

  it("rejects invalid timestampProvider output", async () => {
    await expect(
      generateSpeech({
        model: ttsModel({}),
        voice: "v",
        text: "hello",
        timestamps: true,
        timestampProvider: timestampProvider([
          { text: "extra", start: 0, end: 0.2 },
        ]),
      })
    ).rejects.toMatchObject({ reason: "transcript_mismatch" });
  });

  it("sends exact synthesized text to timestampProvider", async () => {
    const provider = timestampProvider([
      { text: "Say", start: 0, end: 0.2 },
      { text: "el", start: 0.3, end: 0.4 },
      { text: "el", start: 0.4, end: 0.5 },
      { text: "em", start: 0.5, end: 0.6 },
    ]);
    const model = ttsModel({});

    const result = await generateSpeech({
      model,
      voice: "v",
      text: "Say LLM [pause]",
      pronunciations: {
        rules: [{ word: "LLM", replacement: "el el em" }],
      },
      timestamps: true,
      timestampProvider: provider,
    });

    const generatedText = (model.provider.generate as ReturnType<typeof vi.fn>)
      .mock.calls[0][0].text;
    expect(provider.align).toHaveBeenCalledWith(
      expect.objectContaining({ text: generatedText })
    );
    expect(result.timestamps.map(({ text }) => text)).toEqual(["Say", "LLM"]);
  });

  it("projects a pronunciation substitution preceded by punctuation", async () => {
    const provider = timestampProvider([
      { text: "Say", start: 0, end: 0.2 },
      { text: "el", start: 0.3, end: 0.4 },
      { text: "el", start: 0.4, end: 0.5 },
      { text: "em", start: 0.5, end: 0.6 },
    ]);

    const result = await generateSpeech({
      model: ttsModel({}),
      voice: "v",
      text: "Say “LLM”.",
      pronunciations: {
        rules: [{ word: "LLM", replacement: "el el em" }],
      },
      timestamps: true,
      timestampProvider: provider,
    });

    expect(result.timestamps).toEqual([
      { text: "Say", start: 0, end: 0.2 },
      { text: "“LLM”.", start: 0.3, end: 0.6 },
    ]);
  });

  it("preserves a suffix when a provider token crosses a pronunciation edit", async () => {
    const result = await generateSpeech({
      model: ttsModel({
        native: true,
        timestamps: [
          { text: "S-A-F’s", start: 0, end: 0.4 },
          { text: "Annual", start: 0.5, end: 0.8 },
          { text: "Convention.", start: 0.9, end: 1.3 },
        ],
      }),
      voice: "v",
      text: "SAF’s Annual Convention.",
      pronunciations: {
        rules: [{ word: "SAF", replacement: "S-A-F" }],
      },
      timestamps: true,
    });

    expect(result.timestamps).toEqual([
      { text: "SAF’s", start: 0, end: 0.4 },
      { text: "Annual", start: 0.5, end: 0.8 },
      { text: "Convention.", start: 0.9, end: 1.3 },
    ]);
  });

  it("projects a multi-word pronunciation onto provider word boundaries", async () => {
    const result = await generateSpeech({
      model: ttsModel({}),
      voice: "v",
      text: "lead singer joined",
      pronunciations: {
        rules: [{ word: "lead singer", replacement: "leed singer" }],
      },
      timestamps: true,
      timestampProvider: timestampProvider([
        { text: "leed", start: 0, end: 0.2 },
        { text: "singer", start: 0.2, end: 0.6 },
        { text: "joined", start: 0.6, end: 0.9 },
      ]),
    });

    expect(result.timestamps).toEqual([
      { text: "lead", start: 0, end: 0.2 },
      { text: "singer", start: 0.2, end: 0.6 },
      { text: "joined", start: 0.6, end: 0.9 },
    ]);
  });

  it("projects a multi-word pronunciation without a one-to-one provider mapping", async () => {
    const result = await generateSpeech({
      model: ttsModel({}),
      voice: "v",
      text: "lead singer joined",
      pronunciations: {
        rules: [{ word: "lead singer", replacement: "leedsinger" }],
      },
      timestamps: true,
      timestampProvider: timestampProvider([
        { text: "leedsinger", start: 0, end: 0.6 },
        { text: "joined", start: 0.6, end: 0.9 },
      ]),
    });

    expect(result.timestamps).toEqual([
      { text: "lead", start: 0, end: 0.3 },
      { text: "singer", start: 0.3, end: 0.6 },
      { text: "joined", start: 0.6, end: 0.9 },
    ]);
    expect(result.warnings).toEqual([
      "speech-sdk: pronunciation projection estimated one or more word boundaries.",
    ]);
  });

  it("projects Kris Vanhaecht without estimating a boundary", async () => {
    const result = await generateSpeech({
      model: ttsModel({}),
      voice: "v",
      text: "Kris Vanhaecht joined",
      pronunciations: {
        rules: [{ word: "Kris Vanhaecht", replacement: "Kris Van Haagt" }],
      },
      timestamps: true,
      timestampProvider: timestampProvider([
        { text: "Kris", start: 0, end: 0.18 },
        { text: "Van", start: 0.18, end: 0.31 },
        { text: "Haagt", start: 0.31, end: 0.55 },
        { text: "joined", start: 0.55, end: 0.9 },
      ]),
    });

    expect(result.timestamps).toEqual([
      { text: "Kris", start: 0, end: 0.18 },
      { text: "Vanhaecht", start: 0.18, end: 0.55 },
      { text: "joined", start: 0.55, end: 0.9 },
    ]);
    expect(result.warnings).toBeUndefined();
  });

  it("requires timestampProvider before synthesizing a non-native model", async () => {
    const model = ttsModel({});
    await expect(
      generateSpeech({
        model,
        voice: "v",
        text: "hello",
        timestamps: true,
      })
    ).rejects.toMatchObject({ name: "TimestampProviderRequiredError" });
    expect(model.provider.generate).not.toHaveBeenCalled();
  });

  it("ignores timestampProvider for gateway-routed models", async () => {
    const provider = timestampProvider([{ text: "wrong", start: 0, end: 0.2 }]);
    const result = await generateSpeech({
      model: ttsModel({
        id: "speech-gateway",
        timestamps: [{ text: "hello", start: 0, end: 0.2 }],
      }),
      voice: "v",
      text: "hello",
      timestamps: true,
      timestampProvider: provider,
    });

    expect(provider.align).not.toHaveBeenCalled();
    expect(result.timestamps).toEqual([{ text: "hello", start: 0, end: 0.2 }]);
  });
});
