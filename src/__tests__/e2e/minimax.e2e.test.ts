import { describe, expect, it } from "vitest";
import { createMiniMax } from "../../providers/minimax/index.js";
import { generateSpeech } from "./_save-audio.js";

const hasKey = !!process.env.MINIMAX_API_KEY;

// Direct/factory path only: bare `minimax/<model>` strings route through the
// Speech Gateway (a separate hosted backend), not this provider.
describe.skipIf(!hasKey)("MiniMax e2e", () => {
  const TEST_TEXT = "Hello, this is a test of the speech SDK.";
  const voice = process.env.MINIMAX_VOICE_ID ?? "Wise_Woman";
  const minimax = createMiniMax();

  describe.each([
    "speech-2.8-hd",
    "speech-2.8-turbo",
  ] as const)("model: %s", (modelId) => {
    it("generates audio via factory", async () => {
      const result = await generateSpeech({
        model: minimax(modelId),
        text: TEST_TEXT,
        voice,
      });

      expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
      expect(result.audio.base64.length).toBeGreaterThan(0);
      // biome-ignore lint/performance/useTopLevelRegex: single-use test regex
      expect(result.audio.mediaType).toMatch(/^audio\//);
      expect(result.metadata.inputChars).toBe(TEST_TEXT.length);
      expect(result.metadata.audioDurationMs).toBeTypeOf("number");
    });
  });

  it("produces a RIFF WAV when wav output is requested", async () => {
    const result = await generateSpeech({
      model: minimax("speech-2.8-hd"),
      text: TEST_TEXT,
      voice,
      output: { format: "wav" },
    });

    expect(result.audio.mediaType).toBe("audio/wav");
    const head = result.audio.uint8Array.subarray(0, 4);
    expect(Array.from(head)).toEqual([0x52, 0x49, 0x46, 0x46]);
  });

  it("returns raw PCM with a rate-tagged mediaType", async () => {
    const result = await generateSpeech({
      model: minimax("speech-2.8-hd"),
      text: TEST_TEXT,
      voice,
      output: { format: "pcm" },
    });

    // biome-ignore lint/performance/useTopLevelRegex: single-use test regex
    expect(result.audio.mediaType).toMatch(/^audio\/pcm;rate=\d+/);
    expect(result.audio.uint8Array.byteLength % 2).toBe(0);
  });

  it("produces MPEG when mp3 output is requested", async () => {
    const result = await generateSpeech({
      model: minimax("speech-2.8-hd"),
      text: TEST_TEXT,
      voice,
      output: { format: "mp3" },
    });

    expect(result.audio.mediaType).toBe("audio/mpeg");
  });
});
