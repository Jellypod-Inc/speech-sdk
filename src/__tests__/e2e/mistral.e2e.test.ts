import { describe, expect, it } from "vitest";
import { createMistral } from "../../providers/mistral/index.js";
import { streamSpeech } from "../../stream-speech.js";
import { collectStreamAndSave, generateSpeech } from "./_save-audio.js";

const hasKey = !!process.env.MISTRAL_API_KEY;

describe.skipIf(!hasKey)("Mistral e2e", () => {
  const TEST_TEXT = "Hello, this is a test of the speech SDK.";

  it("generates audio via string model identifier", async () => {
    const result = await generateSpeech({
      model: "mistral/voxtral-mini-tts-2603",
      text: TEST_TEXT,
      voice: "en_paul_neutral",
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    expect(result.audio.base64.length).toBeGreaterThan(0);
    // biome-ignore lint/performance/useTopLevelRegex: single-use test regex
    expect(result.audio.mediaType).toMatch(/^audio\//);
  });

  it("generates audio via factory", async () => {
    const mistral = createMistral();
    const result = await generateSpeech({
      model: mistral(),
      text: TEST_TEXT,
      voice: "en_paul_neutral",
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
  });

  it("streams audio via streamSpeech", async () => {
    const result = await streamSpeech({
      model: "mistral/voxtral-mini-tts-2603",
      text: TEST_TEXT,
      voice: "en_paul_neutral",
    });
    const bytes = await collectStreamAndSave(result);
    expect(bytes.byteLength).toBeGreaterThan(0);
    // biome-ignore lint/performance/useTopLevelRegex: single-use test regex
    expect(result.mediaType).toMatch(/^audio\//);
  });

  it("returns metadata with duration", async () => {
    const result = await generateSpeech({
      model: "mistral/voxtral-mini-tts-2603",
      text: TEST_TEXT,
      voice: "en_paul_neutral",
    });

    expect(result.metadata.provider).toBe("mistral");
    expect(result.metadata.model).toBe("voxtral-mini-tts-2603");
    expect(result.metadata.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata.inputChars).toBe(TEST_TEXT.length);
    expect(result.metadata.audioDurationMs).toBeTypeOf("number");
    expect(result.metadata.ttfbMs).toBeUndefined();
  });
});
