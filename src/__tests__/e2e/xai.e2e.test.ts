import { describe, expect, it } from "vitest";
import { createXai } from "../../providers/xai/index.js";
import { streamSpeech } from "../../stream-speech.js";
import { collectStreamAndSave, generateSpeech } from "./_save-audio.js";

const hasKey = !!process.env.XAI_API_KEY;

describe.skipIf(!hasKey)("xAI e2e", () => {
  const TEST_TEXT = "Hello, this is a test of the speech SDK.";

  it("generates audio via string model identifier", async () => {
    const result = await generateSpeech({
      model: "xai/grok-tts",
      text: TEST_TEXT,
      voice: "eve",
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    expect(result.audio.base64.length).toBeGreaterThan(0);
    // biome-ignore lint/performance/useTopLevelRegex: single-use test regex
    expect(result.audio.mediaType).toMatch(/^audio\//);
  });

  it("generates audio via factory", async () => {
    const xai = createXai();
    const result = await generateSpeech({
      model: xai(),
      text: TEST_TEXT,
      voice: "eve",
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
  });

  it("streams audio via streamSpeech", async () => {
    const result = await streamSpeech({
      model: "xai/grok-tts",
      text: TEST_TEXT,
      voice: "eve",
    });
    const bytes = await collectStreamAndSave(result);
    expect(bytes.byteLength).toBeGreaterThan(0);
    // biome-ignore lint/performance/useTopLevelRegex: single-use test regex
    expect(result.mediaType).toMatch(/^audio\//);
  });

  it("returns metadata with duration", async () => {
    const result = await generateSpeech({
      model: "xai/grok-tts",
      text: TEST_TEXT,
      voice: "eve",
    });

    expect(result.metadata.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata.inputChars).toBe(TEST_TEXT.length);
    expect(result.metadata.audioDurationMs).toBeTypeOf("number");
    expect(result.metadata.ttfbMs).toBeUndefined();
  });
});
