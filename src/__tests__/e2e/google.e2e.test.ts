import { describe, expect, it } from "vitest";
import { createGoogle } from "../../providers/google/index.js";
import { streamSpeech } from "../../stream-speech.js";
import { collectStreamAndSave, generateSpeech } from "./_save-audio.js";

const hasKey = !!process.env.GOOGLE_API_KEY;
const GEMINI_SAMPLE_RATE = 24_000;
const BYTES_PER_SAMPLE = 2;
const WAV_HEADER_BYTES = 44;

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
    const bytes = await collectStreamAndSave(result);
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

    expect(result.metadata.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata.inputChars).toBe(TEST_TEXT.length);
    expect(result.metadata.audioDurationMs).toBeTypeOf("number");
    expect(result.metadata.ttfbMs).toBeUndefined();
  });
  // JEL-2332: under the old fused "Read aloud: <line>" framing these one-word lines parsed as a bare
  // delivery directive, never tripped the speech synthesis classifier, and came back PROHIBITED_CONTENT.
  it.each([
    "Slowly.",
    "Quietly.",
    "Softly.",
    "Loudly.",
    "Firmly.",
    "Calmly.",
    "Warmly.",
    "Yes.",
    "Instantly.",
  ])("voices the one-word line %s", async (text) => {
    const google = createGoogle();
    const result = await generateSpeech({
      model: google("gemini-3.1-flash-tts-preview"),
      text,
      voice: "Kore",
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(
      WAV_HEADER_BYTES
    );
  });

  // A spoken preamble would add several seconds; a normal line stays close to its own length.
  it("does not voice the framing preamble on a normal-length line", async () => {
    const google = createGoogle();
    const result = await generateSpeech({
      model: google("gemini-3.1-flash-tts-preview"),
      text: TEST_TEXT,
      voice: "Kore",
    });

    const seconds =
      (result.audio.uint8Array.byteLength - WAV_HEADER_BYTES) /
      (GEMINI_SAMPLE_RATE * BYTES_PER_SAMPLE);
    expect(seconds).toBeGreaterThan(1);
    expect(seconds).toBeLessThan(6);
  });
});
