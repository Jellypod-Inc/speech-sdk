import { describe, expect, it } from "vitest";
import { generateConversation } from "../../generate-conversation.js";

const VOICE_A = process.env.ELEVENLABS_VOICE_ID ?? "JBFqnCBsd6RMkjVDRZzb";
const VOICE_B = process.env.ELEVENLABS_VOICE_ID_B ?? "EXAVITQu4vr4xnSDxMaL";

describe("ElevenLabs v3 native dialogue e2e", () => {
  it("generates a 2-voice dialogue via eleven_v3", async () => {
    const result = await generateConversation({
      model: "elevenlabs/eleven_v3",
      turns: [
        { voice: VOICE_A, text: "Hi there, how are you today?" },
        { voice: VOICE_B, text: "I'm doing well, thanks for asking!" },
      ],
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    // biome-ignore lint/performance/useTopLevelRegex: single-use test regex
    expect(result.audio.mediaType).toMatch(/^audio\//);
    expect(result.metadata.provider).toBe("elevenlabs");
    expect(result.metadata.model).toBe("eleven_v3");
  });
});
