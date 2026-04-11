import { describe, expect, it } from "vitest";
import { generateSpeech } from "../../generate-speech.js";
import { createCartesia } from "../../providers/cartesia/index.js";
import { streamSpeech } from "../../stream-speech.js";
import { collectStream } from "./_collect-stream.js";

const hasKey = !!process.env.CARTESIA_API_KEY;

describe.skipIf(!hasKey)("Cartesia e2e", () => {
  const TEST_TEXT = "Hello, this is a test of the speech SDK.";
  const voice =
    process.env.CARTESIA_VOICE_ID ?? "6ccbfb76-1fc6-48f7-b71d-91ac6298247b";

  describe.each(["sonic-3", "sonic-2"] as const)("model: %s", (modelId) => {
    it("generates audio via string model identifier", async () => {
      const result = await generateSpeech({
        model: `cartesia/${modelId}`,
        text: TEST_TEXT,
        voice,
      });

      expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
      expect(result.audio.base64.length).toBeGreaterThan(0);
      // biome-ignore lint/performance/useTopLevelRegex: single-use test regex
      expect(result.audio.mediaType).toMatch(/^audio\//);
    });

    it("generates audio via factory", async () => {
      const cartesia = createCartesia();
      const result = await generateSpeech({
        model: cartesia(modelId),
        text: TEST_TEXT,
        voice,
      });

      expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    });
  });

  it("streams audio via streamSpeech", async () => {
    const result = await streamSpeech({
      model: "cartesia/sonic-3",
      text: TEST_TEXT,
      voice,
    });
    const bytes = await collectStream(result.audio);
    expect(bytes.byteLength).toBeGreaterThan(0);
    // biome-ignore lint/performance/useTopLevelRegex: single-use test regex
    expect(result.mediaType).toMatch(/^audio\//);
  });

  it("returns metadata with duration", async () => {
    const result = await generateSpeech({
      model: "cartesia/sonic-2",
      text: TEST_TEXT,
      voice,
    });

    expect(result.metadata.provider).toBe("cartesia");
    expect(result.metadata.model).toBe("sonic-2");
    expect(result.metadata.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata.inputChars).toBe(TEST_TEXT.length);
    expect(result.metadata.audioDurationMs).toBeTypeOf("number");
    expect(result.metadata.ttfbMs).toBeUndefined();
  });
});
