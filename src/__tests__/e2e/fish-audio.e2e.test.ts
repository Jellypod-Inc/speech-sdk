import { describe, expect, it } from "vitest";
import { generateSpeech } from "../../generate-speech.js";
import { createFishAudio } from "../../providers/fish-audio/index.js";
import { streamSpeech } from "../../stream-speech.js";
import { collectStream } from "./_collect-stream.js";

const hasKey = !!process.env.FISH_AUDIO_API_KEY;

describe.skipIf(!hasKey)("Fish Audio e2e", () => {
  const TEST_TEXT = "Hello, this is a test of the speech SDK.";

  it("generates audio via string model identifier", async () => {
    const result = await generateSpeech({
      model: "fish-audio/s2-pro",
      text: TEST_TEXT,
      voice:
        process.env.FISH_AUDIO_VOICE_ID ?? "59e9dc1cb20c452584788a2690c80970",
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    expect(result.audio.base64.length).toBeGreaterThan(0);
    // biome-ignore lint/performance/useTopLevelRegex: single-use test regex
    expect(result.audio.mediaType).toMatch(/^audio\//);
  });

  it("generates audio via factory", async () => {
    const fishAudio = createFishAudio();
    const result = await generateSpeech({
      model: fishAudio(),
      text: TEST_TEXT,
      voice:
        process.env.FISH_AUDIO_VOICE_ID ?? "59e9dc1cb20c452584788a2690c80970",
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
  });

  it("streams audio via streamSpeech", async () => {
    const result = await streamSpeech({
      model: "fish-audio/s2-pro",
      text: TEST_TEXT,
      voice:
        process.env.FISH_AUDIO_VOICE_ID ?? "59e9dc1cb20c452584788a2690c80970",
    });
    const bytes = await collectStream(result.audio);
    expect(bytes.byteLength).toBeGreaterThan(0);
    // biome-ignore lint/performance/useTopLevelRegex: single-use test regex
    expect(result.mediaType).toMatch(/^audio\//);
  });
});
