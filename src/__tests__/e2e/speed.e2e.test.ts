import { describe, expect, it } from "vitest";
import { createElevenLabs } from "../../providers/elevenlabs/index.js";
import { generateConversation, generateSpeech } from "./_save-audio.js";

const TEST_TEXT =
  "The quick brown fox jumps over the lazy dog while the speech SDK demonstrates time stretching at various speeds.";
const VOICE = process.env.ELEVENLABS_VOICE_ID ?? "JBFqnCBsd6RMkjVDRZzb";
const elevenlabs = createElevenLabs();
const MODEL = elevenlabs("eleven_flash_v2_5");

describe("speed e2e (elevenlabs direct)", () => {
  describe.each([
    0.85, 1, 1.25, 1.5,
  ] as const)("generateSpeech speed=%s (default output → mp3)", (speed) => {
    it("renders mp3 at the requested speed", async () => {
      const result = await generateSpeech({
        model: MODEL,
        text: TEST_TEXT,
        voice: VOICE,
        speed,
      });

      expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
      expect(result.audio.mediaType).toBe("audio/mpeg");
    });
  });

  describe.each([
    0.85, 1.25, 1.5,
  ] as const)("generateSpeech speed=%s with explicit output: wav", (speed) => {
    it("renders wav at the requested speed", async () => {
      const result = await generateSpeech({
        model: MODEL,
        text: TEST_TEXT,
        voice: VOICE,
        speed,
        output: { format: "wav" },
      });

      expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
      expect(result.audio.mediaType).toBe("audio/wav");
    });
  });

  it("conversation: per-turn speed stacks with top-level speed", async () => {
    const result = await generateConversation({
      model: MODEL,
      turns: [
        {
          voice: VOICE,
          text: "I am the first speaker, talking faster.",
          speed: 1.5,
        },
        {
          voice: VOICE,
          text: "And I am the second speaker, talking slower.",
          speed: 0.85,
        },
      ],
      speed: 1.25,
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    // biome-ignore lint/performance/useTopLevelRegex: single-use test regex
    expect(result.audio.mediaType).toMatch(/^audio\//);
  });
});
