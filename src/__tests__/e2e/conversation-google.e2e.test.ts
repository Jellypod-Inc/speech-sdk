import { describe, expect, it } from "vitest";
import { decodeAudioToPcm16 } from "../../audio-decode.js";
import { createElevenLabs } from "../../providers/elevenlabs/index.js";
import { createGoogle } from "../../providers/google/index.js";
import { canonicalizeTimestampText } from "../../timestamp-finalization.js";
import { generateConversation, maybeSaveResult } from "./_save-audio.js";

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

const AUDIO_TAG = /\[[^\]]*\]/g;

const hasSplitTurnsKeys =
  !!process.env.GOOGLE_API_KEY && !!process.env.ELEVENLABS_API_KEY;

describe.skipIf(!hasSplitTurnsKeys)(
  "Google Gemini 3.8 per-turn audio (splitTurns) e2e",
  () => {
    it("splits a two-host dialogue into one clip per turn", {
      timeout: 180_000,
    }, async () => {
      const turns = [
        { voice: "Kore", text: "So I finally tried the new ramen place." },
        { voice: "Puck", text: "[laughs] You did not. How was it?" },
        {
          voice: "Kore",
          text: "Honestly, the broth was incredible, but the line was long.",
        },
        { voice: "Puck", text: "Hmm, worth the wait though?" },
      ];
      const result = await generateConversation({
        model: createGoogle()("gemini-3.8-flash-tts"),
        turns,
        timestamps: true,
        timestampProvider: createElevenLabs().forcedAlignment(),
        splitTurns: true,
        output: { format: "wav" },
      });

      for (const turn of result.turns) {
        await maybeSaveResult(
          `turn-${turn.turnIndex}`,
          turn.audio,
          turn.timestamps
        );
      }

      expect(result.metadata.path).toBe("native");
      expect(result.turns.map((t) => t.turnIndex)).toEqual([0, 1, 2, 3]);

      const full = await decodeAudioToPcm16(
        result.audio.uint8Array,
        result.audio.mediaType
      );
      const fullMs = (full.pcm.length / full.sampleRate) * 1000;
      expect(result.turns[0].startMs).toBe(0);
      expect(result.turns.at(-1)?.endMs).toBeCloseTo(fullMs, 3);

      let decodedSamples = 0;
      for (const [i, turn] of result.turns.entries()) {
        if (i > 0) {
          expect(turn.startMs).toBe(result.turns[i - 1].endMs);
        }
        expect(turn.audio.mediaType).toBe("audio/wav");
        expect(turn.timestamps.length).toBeGreaterThan(0);
        // Each clip carries exactly its own turn's words (audio tags aren't spoken words).
        expect(
          canonicalizeTimestampText(
            turn.timestamps.map((w) => w.text).join(" ")
          )
        ).toBe(canonicalizeTimestampText(turns[i].text.replace(AUDIO_TAG, "")));

        const clip = await decodeAudioToPcm16(
          turn.audio.uint8Array,
          turn.audio.mediaType
        );
        decodedSamples += clip.pcm.length;
        const clipSec = clip.pcm.length / clip.sampleRate;
        expect(clipSec * 1000).toBeCloseTo(turn.endMs - turn.startMs, 3);
        for (const word of turn.timestamps) {
          expect(word.start).toBeGreaterThanOrEqual(0);
          expect(word.end).toBeLessThanOrEqual(clipSec);
        }
      }
      expect(decodedSamples).toBe(full.pcm.length);
    });
  }
);
