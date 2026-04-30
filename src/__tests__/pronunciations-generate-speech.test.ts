import { describe, expect, it, vi } from "vitest";
import { generateSpeech } from "../generate-speech.js";
import type { ResolvedModel, SpeechProvider } from "../speech-provider.js";

const DICTIONARY_IDS_PATTERN = /dictionaryIds/i;

function fakeModel(spy: ReturnType<typeof vi.fn>): ResolvedModel<string> {
  const provider: SpeechProvider<string, string> = {
    id: "fake",
    defaultModel: "f1",
    models: [
      { id: "f1", features: [], languages: [], releaseDate: "2024-01-01" },
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
      "LLM",
    ]);
  });

  it("throws DictionaryIdsRequireGatewayError on direct path with dictionary ids", async () => {
    const generateSpy = vi.fn();
    await expect(() =>
      generateSpeech({
        model: fakeModel(generateSpy),
        voice: "v1",
        text: "hi",
        pronunciations: { dictionaryIds: ["d1"] },
      })
    ).rejects.toThrow(DICTIONARY_IDS_PATTERN);
    expect(generateSpy).not.toHaveBeenCalled();
  });
});
