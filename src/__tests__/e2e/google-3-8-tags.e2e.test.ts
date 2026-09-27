import { describe, expect, it } from "vitest";
import { createGoogle } from "../../providers/google/index.js";
import { createOpenAI } from "../../providers/openai/index.js";
import { generateConversation, generateSpeech } from "./_save-audio.js";

const hasKeys = !!process.env.GOOGLE_API_KEY && !!process.env.OPENAI_API_KEY;
const DIRECTION_WORDS = /\b(skeptical|chuckles?|excited)\b/i;

// Whisper transcribes what was actually spoken, so an inline tag Gemini reads aloud fails alignment with transcript_mismatch.
describe.skipIf(!hasKeys)("Gemini 3.8 bracket tag conversion e2e", () => {
  const google = createGoogle({ fallbackSTT: createOpenAI().stt() });

  it("voices a single-speaker line without speaking its tags", {
    timeout: 120_000,
  }, async () => {
    const result = await generateSpeech({
      model: google("gemini-3.8-flash-tts"),
      text: "[skeptical] You really tried it? [chuckles] Wait, [excited] that changes everything.",
      voice: "Kore",
      timestamps: true,
    });

    const words = result.timestamps ?? [];
    expect(words.map((w) => w.text).join(" ")).not.toMatch(DIRECTION_WORDS);
    expect(words.length).toBeGreaterThan(5);
  });

  it("voices a two-voice dialogue without speaking its tags", {
    timeout: 180_000,
  }, async () => {
    const turns = [
      {
        voice: "Kore",
        text: "[skeptical] So you finally tried the ramen place?",
      },
      {
        voice: "Puck",
        text: "[chuckles] I did. Wait, [excited] the broth was incredible.",
      },
      { voice: "Kore", text: "Okay, now I have to go." },
    ];
    const result = await generateConversation({
      model: google("gemini-3.8-flash-tts"),
      turns,
      timestamps: true,
      splitTurns: true,
    });

    expect(result.metadata.path).toBe("native");
    expect(result.turns.map((turn) => turn.turnIndex)).toEqual([0, 1, 2]);
    const words = result.timestamps ?? [];
    expect(words.map((w) => w.text).join(" ")).not.toMatch(DIRECTION_WORDS);
    expect([...new Set(words.map((w) => w.turnIndex))]).toEqual([0, 1, 2]);
  });
});
