import pRetry from "p-retry";
import { describe, expect, it } from "vitest";
import { cloneVoice } from "../../clone-voice.js";
import { createSmallestAI } from "../../providers/smallest-ai/index.js";
import { generateSpeech } from "./_save-audio.js";

const SAMPLE_TEXT =
  "This is a reference recording used to create a cloned voice for the speech SDK " +
  "regression test. It is several seconds long so the model has enough audio to work with.";

function isRiffWav(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x41 &&
    bytes[10] === 0x56 &&
    bytes[11] === 0x45
  );
}

describe.skipIf(!process.env.SMALLEST_API_KEY)(
  "Smallest AI clone + generate e2e",
  () => {
    it("clones a voice and generates speech with it", async () => {
      const smallest = createSmallestAI();

      const sample = await generateSpeech({
        model: smallest("lightning_v3.1"),
        text: SAMPLE_TEXT,
        voice: "magnus",
        output: { format: "wav" },
      });
      expect(isRiffWav(sample.audio.uint8Array)).toBe(true);

      const cloned = await cloneVoice({
        provider: createSmallestAI(),
        name: `sdk-e2e-${Date.now()}`,
        language: "en",
        files: {
          audio: sample.audio.uint8Array,
          mediaType: sample.audio.mediaType,
        },
      });
      expect(cloned.provider).toBe("smallest-ai");
      expect(cloned.voiceId.length).toBeGreaterThan(0);

      // A freshly cloned voice can take a few seconds to propagate before
      // get_speech accepts it (transient "Invalid Voice ID"), so retry briefly.
      const speech = await pRetry(
        () =>
          generateSpeech({
            model: smallest("lightning_v3.1"),
            text: "Hello, this audio was generated using my freshly cloned voice.",
            voice: cloned.voiceId,
            output: { format: "wav" },
          }),
        { retries: 4, minTimeout: 1000, factor: 2 }
      );
      expect(speech.audio.mediaType).toContain("wav");
      expect(isRiffWav(speech.audio.uint8Array)).toBe(true);
      expect(speech.audio.uint8Array.length).toBeGreaterThan(1000);
    }, 120_000);
  }
);
