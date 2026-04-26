import { describe, expect, it } from "vitest";
import { generateConversation } from "./_save-audio.js";

describe("Google Gemini native dialogue e2e", () => {
  it("generates a 2-voice dialogue via gemini-3.1-flash-tts-preview", async () => {
    const result = await generateConversation({
      model: "google/gemini-3.1-flash-tts-preview",
      turns: [
        { voice: "Kore", text: "Hi, how are you today?" },
        { voice: "Puck", text: "I'm doing well, thanks!" },
      ],
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    expect(result.audio.mediaType).toBe("audio/wav");
  });
});
