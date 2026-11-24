import { describe, expect, it } from "vitest";
import { generateConversation } from "./_save-audio.js";

const VOICE_A = process.env.ELEVENLABS_VOICE_ID ?? "JBFqnCBsd6RMkjVDRZzb";
const VOICE_B = process.env.ELEVENLABS_VOICE_ID_B ?? "EXAVITQu4vr4xnSDxMaL";

describe.each([
  "eleven_v4",
  "eleven_v3",
] as const)("ElevenLabs native dialogue e2e: %s", (modelId) => {
  it("generates a 2-voice dialogue", async () => {
    const result = await generateConversation({
      model: `elevenlabs/${modelId}`,
      turns: [
        { voice: VOICE_A, text: "Hi there, how are you today?" },
        { voice: VOICE_B, text: "I'm doing well, thanks for asking!" },
      ],
    });

    expect(result.metadata.path).toBe("native");
    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    // biome-ignore lint/performance/useTopLevelRegex: single-use test regex
    expect(result.audio.mediaType).toMatch(/^audio\//);
  });

  it("returns per-turn timestamps via /text-to-dialogue/with-timestamps", async () => {
    const result = await generateConversation({
      model: `elevenlabs/${modelId}`,
      turns: [
        { voice: VOICE_A, text: "Hi there, how are you today?" },
        { voice: VOICE_B, text: "I'm doing well, thanks for asking!" },
      ],
      timestamps: true,
    });

    expect(result.metadata.path).toBe("native");
    const turnIndexes = new Set(result.timestamps.map((w) => w.turnIndex));
    expect(turnIndexes).toEqual(new Set([0, 1]));
  });
});
