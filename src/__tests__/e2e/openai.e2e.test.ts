import { describe, expect, it } from "vitest";
import { generateSpeech } from "../../generate-speech.js";
import { createOpenAI } from "../../providers/openai/index.js";
import { saveAudioIfRequested } from "./save-audio.js";

const TEST_TEXT = "Hello, this is a test of the speech SDK.";
const VOICE = "alloy";

describe("OpenAI e2e", () => {
  describe.each([
    "gpt-4o-mini-tts",
    "tts-1",
    "tts-1-hd",
  ] as const)("model: %s", (modelId) => {
    it("generates audio via string model identifier", async () => {
      const result = await generateSpeech({
        model: `openai/${modelId}`,
        text: TEST_TEXT,
        voice: VOICE,
      });

      expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
      expect(result.audio.base64.length).toBeGreaterThan(0);
      // biome-ignore lint/performance/useTopLevelRegex: single-use test regex
      expect(result.audio.mediaType).toMatch(/^audio\//);
    });

    it("generates audio via createOpenAI factory", async () => {
      const openai = createOpenAI();
      const result = await generateSpeech({
        model: openai(modelId),
        text: TEST_TEXT,
        voice: VOICE,
      });

      expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
      // biome-ignore lint/performance/useTopLevelRegex: single-use test regex
      expect(result.audio.mediaType).toMatch(/^audio\//);
    });
  });

  it("uses default model when none specified", async () => {
    const openai = createOpenAI();
    const result = await generateSpeech({
      model: openai(),
      text: TEST_TEXT,
      voice: VOICE,
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
  });

  it("respects abort signal", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      generateSpeech({
        model: "openai/tts-1",
        text: TEST_TEXT,
        voice: VOICE,
        abortSignal: controller.signal,
        maxRetries: 0,
      })
    ).rejects.toThrow();
  });

  it("passes provider options (response_format, speed)", async () => {
    const result = await generateSpeech({
      model: "openai/tts-1",
      text: TEST_TEXT,
      voice: VOICE,
      providerOptions: { response_format: "opus", speed: 1.2 },
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
  });

  it("maps audio tag instructions to gpt-4o-mini-tts", async () => {
    const result = await generateSpeech({
      model: "openai/gpt-4o-mini-tts",
      voice: "alloy",
      text: "[cheerfully] Hello there! [soft] How are you today?",
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(1000);
    expect(result.warnings).toBeUndefined();

    saveAudioIfRequested("openai-gpt-4o-mini-tts-audio-tags", result.audio);
  });
});
