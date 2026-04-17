import { describe, expect, it } from "vitest";
import { generateConversation } from "../../generate-conversation.js";

const VOICE_A = process.env.FISH_AUDIO_VOICE_A;
const VOICE_B = process.env.FISH_AUDIO_VOICE_B;

describe.skipIf(!(VOICE_A && VOICE_B))(
  "Fish Audio S2-Pro native dialogue e2e",
  () => {
    it("generates a 2-voice dialogue via s2-pro", async () => {
      const result = await generateConversation({
        model: "fish-audio/s2-pro",
        turns: [
          { voice: VOICE_A!, text: "Hi there!" },
          { voice: VOICE_B!, text: "Hello back!" },
        ],
      });
      expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
      expect(result.metadata.provider).toBe("fish-audio");
      expect(result.metadata.model).toBe("s2-pro");
    });
  }
);
