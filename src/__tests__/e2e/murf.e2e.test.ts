import { describe, expect, it } from "vitest";
import { generateSpeech } from "../../generate-speech.js";
import { createMurf } from "../../providers/murf/index.js";

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
});
