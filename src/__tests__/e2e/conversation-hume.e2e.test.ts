import { describe, expect, it } from "vitest";
import { generateConversation } from "../../generate-conversation.js";
import { maybeSaveAudio } from "./_save-audio.js";

const hasKey = !!process.env.HUME_API_KEY;

// "Kora" is the same voice the existing hume.e2e.test.ts uses successfully.
// HUME_VOICE_A / HUME_VOICE_B can override for a true two-voice test.
const VOICE_A = process.env.HUME_VOICE_A ?? "Kora";
const VOICE_B = process.env.HUME_VOICE_B ?? "Kora";

describe.skipIf(!hasKey)("Hume Octave native dialogue e2e", () => {
  it("generates a multi-turn dialogue via octave-2", async () => {
    const result = await generateConversation({
      model: "hume/octave-2",
      turns: [
        { voice: VOICE_A, text: "Hi there, how are you?" },
        { voice: VOICE_B, text: "I'm great, thanks!" },
      ],
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    expect(result.metadata.provider).toBe("hume");
    expect(result.metadata.model).toBe("octave-2");

    await maybeSaveAudio("conversation-hume-octave", result.audio);
  });
});
