import { describe, expect, it } from "vitest";
import { generateConversation } from "../../generate-conversation.js";
import { maybeSaveAudio } from "./_save-audio.js";

const hasAllKeys =
  !!process.env.OPENAI_API_KEY &&
  !!process.env.ELEVENLABS_API_KEY &&
  !!process.env.GOOGLE_API_KEY &&
  !!process.env.HUME_API_KEY;

const ELEVEN_VOICE = process.env.ELEVENLABS_VOICE_ID ?? "JBFqnCBsd6RMkjVDRZzb";

describe.skipIf(!hasAllKeys)(
  "Conversation stitch e2e — four providers (OpenAI + ElevenLabs + Google + Hume)",
  () => {
    it("stitches one turn per provider into a single WAV at the 4-unique-voice cap", {
      timeout: 120_000,
    }, async () => {
      const result = await generateConversation({
        turns: [
          {
            model: "openai/tts-1",
            voice: "nova",
            text: "Hey everyone, I'm Nova, hosted by OpenAI's text-to-speech model. I've been asked to kick off this little panel about how multi-speaker dialogue can be stitched together from completely different text-to-speech providers — all inside a single audio file.",
          },
          {
            model: "elevenlabs/eleven_multilingual_v2",
            voice: ELEVEN_VOICE,
            text: "Thanks Nova — this is George, speaking from ElevenLabs. What's striking is that we're all running in parallel, returning PCM audio at matched sample rates, and the Speech SDK is concatenating us into one WAV without having to decode anything compressed. It's efficient and it sounds natural.",
          },
          {
            model: "google/gemini-3.1-flash-tts-preview",
            voice: "Kore",
            text: "Hi folks, this is Kore coming to you from Google's Gemini three-point-one flash TTS model. One thing I appreciate about this design is that when an entire conversation happens on a single provider that supports native dialogue, we can skip the stitching step entirely and take the fast path instead.",
          },
          {
            model: "hume/octave-2",
            voice: "Kora",
            text: "And I'm Kora, from Hume's Octave model. What you're hearing is four different voices from four different companies, captured in a single WAV file — stitched by the Speech SDK with a short silence between each turn. Thanks for listening to our little demo.",
          },
        ],
        gapMs: 300,
      });

      // Aggregate output is a single WAV.
      expect(result.audio.mediaType).toBe("audio/wav");
      expect(result.audio.uint8Array.byteLength).toBeGreaterThan(44);

      // Aggregate metadata names every distinct provider/model used.
      for (const id of ["openai", "elevenlabs", "google", "hume"]) {
        expect(result.metadata.provider).toContain(id);
      }
      for (const id of [
        "tts-1",
        "eleven_multilingual_v2",
        "gemini-3.1-flash-tts-preview",
        "octave-2",
      ]) {
        expect(result.metadata.model).toContain(id);
      }

      // Per-turn provider metadata is preserved on the stitch path.
      const perTurn = (
        result.providerMetadata as { turns?: unknown[] } | undefined
      )?.turns;
      expect(Array.isArray(perTurn)).toBe(true);
      expect((perTurn as unknown[]).length).toBe(4);

      expect(result.metadata.inputChars).toBeGreaterThan(0);
      expect(result.metadata.audioDurationMs ?? 0).toBeGreaterThan(10_000);

      await maybeSaveAudio(
        "conversation-stitch-openai+elevenlabs+google+hume",
        result.audio
      );
    });
  }
);
