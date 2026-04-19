import { describe, expect, it } from "vitest";
import { generateConversation } from "./_save-audio.js";

const hasKey = !!process.env.FISH_AUDIO_API_KEY;

// Reuse the same default reference_id the existing fish-audio.e2e.test.ts uses.
// FISH_AUDIO_VOICE_A / FISH_AUDIO_VOICE_B can override for a true two-voice test.
const DEFAULT_VOICE = "59e9dc1cb20c452584788a2690c80970";
const VOICE_A = process.env.FISH_AUDIO_VOICE_A ?? DEFAULT_VOICE;
const VOICE_B = process.env.FISH_AUDIO_VOICE_B ?? DEFAULT_VOICE;

describe.skipIf(!hasKey)("Fish Audio S2-Pro native dialogue e2e", () => {
  it("generates a multi-turn dialogue via s2-pro", async () => {
    const result = await generateConversation({
      model: "fish-audio/s2-pro",
      turns: [
        { voice: VOICE_A, text: "Hi there!" },
        { voice: VOICE_B, text: "Hello back!" },
      ],
    });
    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    expect(result.metadata.provider).toBe("fish-audio");
    expect(result.metadata.model).toBe("s2-pro");
  });
});
