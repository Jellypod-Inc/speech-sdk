import { describe, expect, it } from "vitest";
import { createHume } from "../../providers/hume/index.js";
import { streamSpeech } from "../../stream-speech.js";
import { collectStreamAndSave, generateSpeech } from "./_save-audio.js";

const hasKey = !!process.env.HUME_API_KEY;

describe.skipIf(!hasKey)("Hume e2e", () => {
  const TEST_TEXT = "Hello, this is a test of the speech SDK.";

  describe.each(["octave-2", "octave-1"] as const)("model: %s", (modelId) => {
    it("generates audio via string model identifier", async () => {
      const result = await generateSpeech({
        model: `hume/${modelId}`,
        text: TEST_TEXT,
        voice: "Kora",
      });

      expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
      expect(result.audio.base64.length).toBeGreaterThan(0);
      // biome-ignore lint/performance/useTopLevelRegex: single-use test regex
      expect(result.audio.mediaType).toMatch(/^audio\//);
    });

    it("generates audio via factory", async () => {
      const hume = createHume();
      const result = await generateSpeech({
        model: hume(modelId),
        text: TEST_TEXT,
        voice: "Kora",
      });

      expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    });
  });

  it("streams audio via streamSpeech", async () => {
    const result = await streamSpeech({
      model: "hume/octave-2",
      text: TEST_TEXT,
      voice: "Kora",
    });
    const bytes = await collectStreamAndSave(result);
    expect(bytes.byteLength).toBeGreaterThan(0);
    // biome-ignore lint/performance/useTopLevelRegex: single-use test regex
    expect(result.mediaType).toMatch(/^audio\//);
  });

  it("returns metadata with duration", async () => {
    const result = await generateSpeech({
      model: "hume/octave-2",
      text: TEST_TEXT,
      voice: "Kora",
    });

    expect(result.metadata.provider).toBe("hume");
    expect(result.metadata.model).toBe("octave-2");
    expect(result.metadata.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata.inputChars).toBe(TEST_TEXT.length);
    expect(result.metadata.audioDurationMs).toBeTypeOf("number");
    expect(result.metadata.ttfbMs).toBeUndefined();
  });

  describe("timestamps (native /v0/tts)", () => {
    it("returns word timestamps on the timestamps:on for octave-2", async () => {
      const result = await generateSpeech({
        model: "hume/octave-2",
        text: TEST_TEXT,
        voice: "Kora",
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
      // Last word's end must not exceed the audio; generous lower bound
      // because providers often append trailing silence after the final word.
      expect(lastEndMs).toBeLessThanOrEqual(durMs + 100);
      expect(lastEndMs).toBeGreaterThan(durMs * 0.5);
    });

    it("off mode suppresses timestamps even on a native model", async () => {
      const result = await generateSpeech({
        model: "hume/octave-2",
        text: TEST_TEXT,
        voice: "Kora",
        timestamps: false,
      });

      expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
      expect(result.timestamps).toBeUndefined();
    });
  });
});
