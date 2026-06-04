import { describe, expect, it } from "vitest";
import { createMiniMax } from "../../providers/minimax/index.js";
import { generateSpeech } from "./_save-audio.js";

const hasKey = !!process.env.MINIMAX_API_KEY;

describe.skipIf(!hasKey)("MiniMax e2e", () => {
  const TEST_TEXT = "Hello, this is a test of the speech SDK.";
  const voice = process.env.MINIMAX_VOICE_ID ?? "Wise_Woman";

  describe.each([
    "speech-2.6-hd",
    "speech-2.6-turbo",
    "speech-02-hd",
  ] as const)("model: %s", (modelId) => {
    it("generates audio via string model identifier", async () => {
      const result = await generateSpeech({
        model: `minimax/${modelId}`,
        text: TEST_TEXT,
        voice,
      });

      expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
      expect(result.audio.base64.length).toBeGreaterThan(0);
      // biome-ignore lint/performance/useTopLevelRegex: single-use test regex
      expect(result.audio.mediaType).toMatch(/^audio\//);
    });

    it("generates audio via factory", async () => {
      const minimax = createMiniMax();
      const result = await generateSpeech({
        model: minimax(modelId),
        text: TEST_TEXT,
        voice,
      });

      expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    });
  });

  it("returns metadata with duration", async () => {
    const result = await generateSpeech({
      model: "minimax/speech-2.6-hd",
      text: TEST_TEXT,
      voice,
    });

    expect(result.metadata.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata.inputChars).toBe(TEST_TEXT.length);
    expect(result.metadata.audioDurationMs).toBeTypeOf("number");
  });

  it("produces a RIFF WAV when wav output is requested", async () => {
    const result = await generateSpeech({
      model: "minimax/speech-2.6-hd",
      text: TEST_TEXT,
      voice,
      output: { format: "wav" },
    });

    expect(result.audio.mediaType).toBe("audio/wav");
    const head = result.audio.uint8Array.subarray(0, 4);
    expect(Array.from(head)).toEqual([0x52, 0x49, 0x46, 0x46]);
  });
});
