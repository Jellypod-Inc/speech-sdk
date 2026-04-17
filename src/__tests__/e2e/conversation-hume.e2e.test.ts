import { describe, expect, it } from "vitest";
import { generateConversation } from "../../generate-conversation.js";

const VOICE_A = process.env.HUME_VOICE_A;
const VOICE_B = process.env.HUME_VOICE_B;

describe.skipIf(!(VOICE_A && VOICE_B))(
  "Hume Octave native dialogue e2e",
  () => {
    it("generates a 2-voice dialogue via octave-2", async () => {
      const result = await generateConversation({
        model: "hume/octave-2",
        turns: [
          { voice: VOICE_A as string, text: "Hi there, how are you?" },
          { voice: VOICE_B as string, text: "I'm great, thanks!" },
        ],
      });

      expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
      expect(result.metadata.provider).toBe("hume");
      expect(result.metadata.model).toBe("octave-2");
    });
  }
);
