import { describe, expect, it } from "vitest";
import { generateSpeech } from "../../generate-speech.js";
import { createMurf } from "../../providers/murf/index.js";
import { streamSpeech } from "../../stream-speech.js";
import { collectStream } from "./_collect-stream.js";

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
    const bytes = await collectStream(result.audio);
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
    expect(result.metadata.audioDurationMs).toBeGreaterThan(0);
    expect(result.metadata.ttfbMs).toBeUndefined();
  });
});
