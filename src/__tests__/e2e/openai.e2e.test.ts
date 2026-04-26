import { describe, expect, it } from "vitest";
import { createOpenAI } from "../../providers/openai/index.js";
import { streamSpeech } from "../../stream-speech.js";
import { collectStreamAndSave, generateSpeech } from "./_save-audio.js";

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

  it("streams audio via streamSpeech", async () => {
    const result = await streamSpeech({
      model: "openai/tts-1",
      text: TEST_TEXT,
      voice: VOICE,
    });
    const bytes = await collectStreamAndSave(result);
    expect(bytes.byteLength).toBeGreaterThan(0);
    // biome-ignore lint/performance/useTopLevelRegex: single-use test regex
    expect(result.mediaType).toMatch(/^audio\//);
  });

  it("maps audio tag instructions to gpt-4o-mini-tts", async () => {
    const result = await generateSpeech({
      model: "openai/gpt-4o-mini-tts",
      voice: "alloy",
      text: "[cheerfully] Hello there! [soft] How are you today?",
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(1000);
    expect(result.warnings).toBeUndefined();
  });

  it("returns metadata with duration", async () => {
    const result = await generateSpeech({
      model: "openai/tts-1",
      text: TEST_TEXT,
      voice: VOICE,
    });

    expect(result.metadata.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata.inputChars).toBe(TEST_TEXT.length);
    expect(result.metadata.audioDurationMs).toBeTypeOf("number");
    expect(result.metadata.ttfbMs).toBeUndefined();
  });

  it("returns metadata with ttfbMs for streaming", async () => {
    const result = await streamSpeech({
      model: "openai/tts-1",
      text: TEST_TEXT,
      voice: VOICE,
    });
    await collectStreamAndSave(result);

    expect(result.metadata.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata.inputChars).toBe(TEST_TEXT.length);
    expect(result.metadata.ttfbMs).toBeGreaterThanOrEqual(0);
  });

  describe("timestamps (derived via Whisper fallback)", () => {
    it("on mode pipes synthesized audio through Whisper and returns word timestamps", async () => {
      const stt = createOpenAI().stt();
      const openai = createOpenAI({
        fallbackSTT: stt,
      });
      const result = await generateSpeech({
        model: openai("tts-1"),
        text: TEST_TEXT,
        voice: VOICE,
        timestamps: true,
      });

      expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
      expect(result.timestamps).toBeDefined();
      const words = result.timestamps ?? [];
      expect(words.length).toBeGreaterThan(0);
      for (const w of words) {
        expect(w.text.length).toBeGreaterThan(0);
        expect(w.end).toBeGreaterThanOrEqual(w.start);
      }
      for (let i = 1; i < words.length; i++) {
        expect(words[i]?.start).toBeGreaterThanOrEqual(
          words[i - 1]?.start ?? 0
        );
      }
    });
  });
});
