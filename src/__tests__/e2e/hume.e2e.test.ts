import { describe, expect, it } from "vitest";
import { generateSpeech } from "../../generate-speech.js";
import { createHume } from "../../providers/hume/index.js";
import { streamSpeech } from "../../stream-speech.js";
import { collectStream } from "./_collect-stream.js";

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
    const bytes = await collectStream(result.audio);
    expect(bytes.byteLength).toBeGreaterThan(0);
    // biome-ignore lint/performance/useTopLevelRegex: single-use test regex
    expect(result.mediaType).toMatch(/^audio\//);
  });
});
