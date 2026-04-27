import { describe, expect, it } from "vitest";
import { createGoogle } from "../../providers/google/index.js";
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

const hasNativeAttributionKeys =
  !!process.env.GOOGLE_API_KEY && !!process.env.OPENAI_API_KEY;

describe.skipIf(!hasNativeAttributionKeys)(
  "Google Gemini native dialogue timestamp attribution e2e",
  () => {
    it("attributes STT-derived words back to native dialogue turns", {
      timeout: 180_000,
    }, async () => {
      const google = createGoogle();
      const result = await generateConversation({
        model: google("gemini-3.1-flash-tts-preview"),
        turns: [
          {
            voice: "Kore",
            text: "First we discuss apples and calendars.",
          },
          {
            voice: "Puck",
            text: "Second we mention bridges and lanterns.",
          },
          {
            voice: "Kore",
            text: "Finally we close with rivers and notebooks.",
          },
        ],
        timestamps: true,
      });

      expect(result.timestamps).toBeDefined();
      const words = result.timestamps ?? [];
      expect(words.length).toBeGreaterThan(8);
      expect(words.every((w) => typeof w.turnIndex === "number")).toBe(true);

      const observedTurnIndices = new Set(words.map((w) => w.turnIndex));
      expect(observedTurnIndices.has(0)).toBe(true);
      expect(observedTurnIndices.has(1)).toBe(true);
      expect(observedTurnIndices.has(2)).toBe(true);

      for (let i = 1; i < words.length; i++) {
        expect(words[i]?.turnIndex ?? 0).toBeGreaterThanOrEqual(
          words[i - 1]?.turnIndex ?? 0
        );
      }
    });
  }
);
