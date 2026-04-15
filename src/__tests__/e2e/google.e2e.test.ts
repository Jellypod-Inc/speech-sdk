import { describe, expect, it } from "vitest";
import { generateSpeech } from "../../generate-speech.js";
import { createGoogle } from "../../providers/google/index.js";
import { streamSpeech } from "../../stream-speech.js";
import { collectStream } from "./_collect-stream.js";

const hasKey = !!process.env.GOOGLE_API_KEY;

describe.skipIf(!hasKey)("Google (Gemini TTS) e2e", () => {
  const TEST_TEXT = "Hello, this is a test of the speech SDK.";

  describe.each([
    "gemini-3.1-flash-tts-preview",
    "gemini-2.5-flash-preview-tts",
    "gemini-2.5-pro-preview-tts",
  ] as const)("model: %s", (modelId) => {
    it("generates audio via string model identifier", async () => {
      const result = await generateSpeech({
        model: `google/${modelId}`,
        text: TEST_TEXT,
        voice: "Kore",
      });

      expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
      expect(result.audio.base64.length).toBeGreaterThan(0);
      // biome-ignore lint/performance/useTopLevelRegex: single-use test regex
      expect(result.audio.mediaType).toMatch(/^audio\//);
    });

    it("generates audio via factory", async () => {
      const google = createGoogle();
      const result = await generateSpeech({
        model: google(modelId),
        text: TEST_TEXT,
        voice: "Kore",
      });

      expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    });
  });

  it("streams audio via streamSpeech", async () => {
    const result = await streamSpeech({
      model: "google/gemini-2.5-flash-preview-tts",
      text: TEST_TEXT,
      voice: "Kore",
    });
    const bytes = await collectStream(result.audio);
    expect(bytes.byteLength).toBeGreaterThan(0);
    // biome-ignore lint/performance/useTopLevelRegex: single-use test regex
    expect(result.mediaType).toMatch(/^audio\//);
  });

  it("returns metadata with duration", async () => {
    const result = await generateSpeech({
      model: "google/gemini-2.5-flash-preview-tts",
      text: TEST_TEXT,
      voice: "Zephyr",
    });

    expect(result.metadata.provider).toBe("google");
    expect(result.metadata.model).toBe("gemini-2.5-flash-preview-tts");
    expect(result.metadata.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata.inputChars).toBe(TEST_TEXT.length);
    expect(result.metadata.audioDurationMs).toBeTypeOf("number");
    expect(result.metadata.ttfbMs).toBeUndefined();
  });
});
