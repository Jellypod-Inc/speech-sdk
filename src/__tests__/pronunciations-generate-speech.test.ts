import { describe, expect, it, vi } from "vitest";
import { generateSpeech } from "../generate-speech.js";
import type { ResolvedModel, SpeechProvider } from "../speech-provider.js";

const SUBSTITUTED_PATTERN = /el el em/;
const AUDIO_TAG_PATTERN = /\[pause\]/;

function fakeModel(spy: ReturnType<typeof vi.fn>): ResolvedModel<string> {
  const provider: SpeechProvider<string, string> = {
    id: "fake",
    defaultModel: "f1",
    models: [
      {
        id: "f1",
        features: ["timestamps"],
        languages: [],
        releaseDate: "2024-01-01",
      },
    ],
    generate: spy,
  };
  return { provider, modelId: "f1" } as ResolvedModel<string>;
}

describe("generateSpeech with pronunciations", () => {
  it("substitutes rules into the text sent to the provider", async () => {
    const generateSpy = vi.fn().mockResolvedValue({
      audio: new Uint8Array([1, 2, 3]),
      mediaType: "audio/wav",
    });
    await generateSpeech({
      model: fakeModel(generateSpy),
      voice: "v1",
      text: "What is LLM?",
      pronunciations: { rules: [{ word: "LLM", replacement: "el el em" }] },
    });
    expect(generateSpy).toHaveBeenCalledTimes(1);
    expect(generateSpy.mock.calls[0][0].text).toBe("What is el el em?");
  });

  it("inverse-aligns timestamps so callers see the original word", async () => {
    const generateSpy = vi.fn().mockResolvedValue({
      audio: new Uint8Array([1]),
      mediaType: "audio/wav",
      timestamps: [
        { text: "What", start: 0, end: 0.2 },
        { text: "is", start: 0.2, end: 0.3 },
        { text: "el", start: 0.3, end: 0.5 },
        { text: "el", start: 0.5, end: 0.7 },
        { text: "em", start: 0.7, end: 0.9 },
      ],
    });
    const result = await generateSpeech({
      model: fakeModel(generateSpy),
      voice: "v1",
      text: "What is LLM?",
      timestamps: true,
      pronunciations: { rules: [{ word: "LLM", replacement: "el el em" }] },
    });
    expect(result.timestamps?.map((t) => t.text)).toEqual([
      "What",
      "is",
      "LLM?",
    ]);
  });
});

describe("generateSpeech with malformed pronunciation rules", () => {
  it("applies a rule with a trailing space as if it were written without one", async () => {
    const generateSpy = vi.fn().mockResolvedValue({
      audio: new Uint8Array([1]),
      mediaType: "audio/wav",
    });
    await generateSpeech({
      model: fakeModel(generateSpy),
      voice: "v1",
      text: "hello world",
      pronunciations: { rules: [{ word: "hello ", replacement: "HELLO" }] },
    });
    expect(generateSpy.mock.calls[0][0].text).toBe("HELLO world");
  });

  it("skips an unusable rule, warns, and still applies the usable ones", async () => {
    const generateSpy = vi.fn().mockResolvedValue({
      audio: new Uint8Array([1]),
      mediaType: "audio/wav",
    });
    const result = await generateSpeech({
      model: fakeModel(generateSpy),
      voice: "v1",
      text: "What is LLM?",
      pronunciations: {
        rules: [
          { word: " ", replacement: "x" },
          { word: "LLM", replacement: "el el em" },
        ],
      },
    });
    expect(generateSpy.mock.calls[0][0].text).toBe("What is el el em?");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings?.[0]).toContain("pronunciations.rules[0]");
  });
});

describe("generateSpeech with pronunciations + audio tags", () => {
  it("strips audio tags before substituting (so edits anchor to provider-visible text)", async () => {
    const generateSpy = vi.fn().mockResolvedValue({
      audio: new Uint8Array([1]),
      mediaType: "audio/wav",
    });
    await generateSpeech({
      model: fakeModel(generateSpy),
      voice: "v1",
      text: "Say LLM [pause] and LLM",
      pronunciations: { rules: [{ word: "LLM", replacement: "el el em" }] },
    });

    const sentText = generateSpy.mock.calls[0][0].text;
    expect(sentText).toMatch(SUBSTITUTED_PATTERN);
    expect(sentText).not.toMatch(AUDIO_TAG_PATTERN);
  });

  it("is a no-op when pronunciations is undefined (text passes through audio-tag stripping only)", async () => {
    const generateSpy = vi.fn().mockResolvedValue({
      audio: new Uint8Array([1]),
      mediaType: "audio/wav",
    });
    await generateSpeech({
      model: fakeModel(generateSpy),
      voice: "v1",
      text: "Plain text without rules",
    });

    expect(generateSpy.mock.calls[0][0].text).toBe("Plain text without rules");
  });

  it("inputChars metric reflects the caller's original text length, not the substituted length", async () => {
    const generateSpy = vi.fn().mockResolvedValue({
      audio: new Uint8Array([1]),
      mediaType: "audio/wav",
    });
    const result = await generateSpeech({
      model: fakeModel(generateSpy),
      voice: "v1",
      text: "What is LLM?",
      pronunciations: { rules: [{ word: "LLM", replacement: "el el em" }] },
    });
    expect(result.metadata.inputChars).toBe(12);
  });
});
