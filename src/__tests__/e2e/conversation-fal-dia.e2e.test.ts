import { describe, expect, it } from "vitest";
import { generateConversation } from "./_save-audio.js";

const hasKey = !!process.env.FAL_API_KEY;

describe.skipIf(!hasKey)("fal Dia native dialogue e2e", () => {
  it("generates a 2-speaker conversation via dia-tts", {
    timeout: 180_000,
  }, async () => {
    const result = await generateConversation({
      model: "fal-ai/dia-tts",
      turns: [
        { voice: "s1", text: "Hi there!" },
        { voice: "s2", text: "Hello back!" },
      ],
    });
    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    expect(result.metadata.provider).toBe("fal-ai");
    expect(result.metadata.model).toBe("dia-tts");
  });
});
