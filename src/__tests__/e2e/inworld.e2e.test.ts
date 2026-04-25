import { describe, expect, it } from "vitest";
import { createInworld } from "../../providers/inworld/index.js";
import { streamSpeech } from "../../stream-speech.js";
import { collectStreamAndSave, generateSpeech } from "./_save-audio.js";

const hasKey = !!process.env.INWORLD_API_KEY;

describe.skipIf(!hasKey)("Inworld e2e", () => {
  const TEST_TEXT = "Hello, this is a test of the speech SDK.";
  const voice = process.env.INWORLD_VOICE_ID ?? "Ashley";

  describe.each([
    "inworld-tts-1.5-max",
    "inworld-tts-1.5-mini",
  ] as const)("model: %s", (modelId) => {
    it("generates audio via string model identifier", async () => {
      const result = await generateSpeech({
        model: `inworld/${modelId}`,
        text: TEST_TEXT,
        voice,
      });

      expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
      expect(result.audio.base64.length).toBeGreaterThan(0);
      // biome-ignore lint/performance/useTopLevelRegex: single-use test regex
      expect(result.audio.mediaType).toMatch(/^audio\//);
    });

    it("generates audio via factory", async () => {
      const inworld = createInworld();
      const result = await generateSpeech({
        model: inworld(modelId),
        text: TEST_TEXT,
        voice,
      });

      expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    });
  });

  it("streams audio via streamSpeech", async () => {
    const result = await streamSpeech({
      model: "inworld/inworld-tts-1.5-max",
      text: TEST_TEXT,
      voice,
    });
    const bytes = await collectStreamAndSave(result);
    expect(bytes.byteLength).toBeGreaterThan(0);
    // biome-ignore lint/performance/useTopLevelRegex: single-use test regex
    expect(result.mediaType).toMatch(/^audio\//);
  });

  it("returns metadata with input chars and provider info", async () => {
    const result = await generateSpeech({
      model: "inworld/inworld-tts-1.5-mini",
      text: TEST_TEXT,
      voice,
    });

    expect(result.metadata.provider).toBe("inworld");
    expect(result.metadata.model).toBe("inworld-tts-1.5-mini");
    expect(result.metadata.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata.inputChars).toBe(TEST_TEXT.length);
  });

  describe("timestamps (native wordAlignment)", () => {
    it.each([
      "inworld-tts-1.5-max",
      "inworld-tts-1.5-mini",
    ] as const)("returns word timestamps on the timestamps:on for %s", async (modelId) => {
      const result = await generateSpeech({
        model: `inworld/${modelId}`,
        text: TEST_TEXT,
        voice,
        timestamps: true,
      });

      expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
      expect(result.timestamps).toBeDefined();
      const words = result.timestamps ?? [];
      expect(words.length).toBeGreaterThan(0);
      for (const w of words) {
        expect(w.text.length).toBeGreaterThan(0);
        expect(typeof w.start).toBe("number");
        expect(typeof w.end).toBe("number");
        expect(w.end).toBeGreaterThanOrEqual(w.start);
      }
      for (let i = 1; i < words.length; i++) {
        const cur = words[i];
        const prev = words[i - 1];
        if (cur && prev) {
          expect(cur.start).toBeGreaterThanOrEqual(prev.start);
        }
      }
      const lastEndMs = (words.at(-1)?.end ?? 0) * 1000;
      const durMs = result.metadata.audioDurationMs ?? 0;
      if (durMs > 0) {
        expect(Math.abs(lastEndMs - durMs)).toBeLessThan(500);
      }
    });

    it("off mode suppresses timestamps even on a native model", async () => {
      const result = await generateSpeech({
        model: "inworld/inworld-tts-1.5-max",
        text: TEST_TEXT,
        voice,
        timestamps: false,
      });

      expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
      expect(result.timestamps).toBeUndefined();
    });
  });
});
