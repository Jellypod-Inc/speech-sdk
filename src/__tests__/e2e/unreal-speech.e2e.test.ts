import { describe, expect, it } from "vitest";
import { generateSpeech } from "../../generate-speech.js";
import { createUnrealSpeech } from "../../providers/unreal-speech/index.js";
import { streamSpeech } from "../../stream-speech.js";
import { collectStream } from "./_collect-stream.js";

const hasKey = !!process.env.UNREAL_SPEECH_API_KEY;

describe.skipIf(!hasKey)("Unreal Speech e2e", () => {
  const TEST_TEXT = "Hello, this is a test of the speech SDK.";

  it("generates audio via string model identifier", async () => {
    const result = await generateSpeech({
      model: "unreal-speech/default",
      text: TEST_TEXT,
      voice: "Sierra",
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    expect(result.audio.base64.length).toBeGreaterThan(0);
    // biome-ignore lint/performance/useTopLevelRegex: single-use test regex
    expect(result.audio.mediaType).toMatch(/^audio\//);
  });

  it("generates audio via factory", async () => {
    const unrealSpeech = createUnrealSpeech();
    const result = await generateSpeech({
      model: unrealSpeech(),
      text: TEST_TEXT,
      voice: "Sierra",
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
  });

  it("streams audio via streamSpeech", async () => {
    const result = await streamSpeech({
      model: "unreal-speech/default",
      text: TEST_TEXT,
      voice: "Sierra",
    });
    const bytes = await collectStream(result.audio);
    expect(bytes.byteLength).toBeGreaterThan(0);
    // biome-ignore lint/performance/useTopLevelRegex: single-use test regex
    expect(result.mediaType).toMatch(/^audio\//);
  });

  it("returns metadata with duration", async () => {
    const result = await generateSpeech({
      model: "unreal-speech/default",
      text: TEST_TEXT,
      voice: "Dan",
    });

    expect(result.metadata.provider).toBe("unreal-speech");
    expect(result.metadata.model).toBe("default");
    expect(result.metadata.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata.inputChars).toBe(TEST_TEXT.length);
    expect(result.metadata.audioDurationMs).toBeGreaterThan(0);
    expect(result.metadata.ttfbMs).toBeUndefined();
  });
});
