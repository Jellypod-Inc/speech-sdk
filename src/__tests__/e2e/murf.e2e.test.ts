import { describe, expect, it } from "vitest";
import { createMurf } from "../../providers/murf/index.js";
import { streamSpeech } from "../../stream-speech.js";
import { collectStreamAndSave, generateSpeech } from "./_save-audio.js";

const hasKey = !!process.env.MURF_API_KEY;

describe.skipIf(!hasKey)("Murf e2e", () => {
  const TEST_TEXT = "Hello, this is a test of the speech SDK.";

  describe.each(["GEN2", "FALCON"] as const)("model: %s", (modelId) => {
    it("generates audio via string model identifier", async () => {
      const result = await generateSpeech({
        model: `murf/${modelId}`,
        text: TEST_TEXT,
        voice: "en-US-natalie",
      });

      expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
      expect(result.audio.base64.length).toBeGreaterThan(0);
      // biome-ignore lint/performance/useTopLevelRegex: single-use test regex
      expect(result.audio.mediaType).toMatch(/^audio\//);
    });

    it("generates audio via factory", async () => {
      const murf = createMurf();
      const result = await generateSpeech({
        model: murf(modelId),
        text: TEST_TEXT,
        voice: "en-US-natalie",
      });

      expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    });
  });

  it("streams audio via streamSpeech", async () => {
    const result = await streamSpeech({
      model: "murf/GEN2",
      text: TEST_TEXT,
      voice: "en-US-natalie",
    });
    const bytes = await collectStreamAndSave(result);
    expect(bytes.byteLength).toBeGreaterThan(0);
    // biome-ignore lint/performance/useTopLevelRegex: single-use test regex
    expect(result.mediaType).toMatch(/^audio\//);
  });

  it("returns metadata with duration", async () => {
    const result = await generateSpeech({
      model: "murf/GEN2",
      text: TEST_TEXT,
      voice: "en-US-natalie",
    });

    expect(result.metadata.provider).toBe("murf");
    expect(result.metadata.model).toBe("GEN2");
    expect(result.metadata.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata.inputChars).toBe(TEST_TEXT.length);
    expect(result.metadata.audioDurationMs).toBeTypeOf("number");
    expect(result.metadata.ttfbMs).toBeUndefined();
  });

  describe("timestamps (native wordDurations)", () => {
    it("returns word timestamps on the timestamps:on for GEN2", async () => {
      const result = await generateSpeech({
        model: "murf/GEN2",
        text: TEST_TEXT,
        voice: "en-US-natalie",
        timestamps: "on",
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
        expect(words[i]?.start).toBeGreaterThanOrEqual(
          words[i - 1]?.start ?? 0
        );
      }
      const lastEndMs = (words.at(-1)?.end ?? 0) * 1000;
      const durMs = result.metadata.audioDurationMs ?? 0;
      expect(Math.abs(lastEndMs - durMs)).toBeLessThan(500);
    });

    it("off mode suppresses timestamps even on a native model", async () => {
      const result = await generateSpeech({
        model: "murf/GEN2",
        text: TEST_TEXT,
        voice: "en-US-natalie",
        timestamps: "off",
      });

      expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
      expect(result.timestamps).toBeUndefined();
    });
  });
});
