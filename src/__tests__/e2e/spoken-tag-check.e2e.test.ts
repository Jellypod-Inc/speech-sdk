import { describe, expect, it } from "vitest";
import { decodeAudioToPcm16 } from "../../audio-decode.js";
import { createElevenLabs } from "../../providers/elevenlabs/index.js";
import { checkSpokenTagsInAudio, pcm16ToWav } from "../../spoken-tags.js";
import { generateSpeech } from "./_save-audio.js";

const VOICE = process.env.ELEVENLABS_VOICE_ID ?? "JBFqnCBsd6RMkjVDRZzb";
const TAGGED =
  "It was a daring dream. [curious] In 1962, Britain and France signed a treaty.";
// The same line with the tag voiced as a word, standing in for a voice that reads the tag aloud.
const SPOKEN =
  "It was a daring dream. Curious. In 1962, Britain and France signed a treaty.";
const NON_WORD_CHARACTERS = /[^\p{L}\p{N}]/gu;

function skeleton(text: string): string {
  return text.toLowerCase().replace(NON_WORD_CHARACTERS, "");
}

describe("ElevenLabs spoken-tag check e2e", () => {
  const elevenlabs = createElevenLabs();
  const scribe = elevenlabs.transcription();

  it("Scribe returns timed words for synthesized speech", async () => {
    const speech = await generateSpeech({
      model: elevenlabs("eleven_multilingual_v2"),
      voice: VOICE,
      text: "The quick brown fox jumps over the lazy dog.",
      output: { format: "wav" },
    });

    const words = await scribe.transcribe({
      audio: speech.audio.uint8Array,
      mediaType: speech.audio.mediaType,
    });

    expect(words.map((w) => skeleton(w.text))).toEqual([
      "the",
      "quick",
      "brown",
      "fox",
      "jumps",
      "over",
      "the",
      "lazy",
      "dog",
    ]);
    for (const word of words) {
      expect(word.end).toBeGreaterThan(word.start);
    }
  });

  it("cuts a tag read aloud and keeps the rest of the line", async () => {
    const speech = await generateSpeech({
      model: elevenlabs("eleven_multilingual_v2"),
      voice: VOICE,
      text: SPOKEN,
      output: { format: "wav" },
    });

    const checked = await checkSpokenTagsInAudio({
      audio: speech.audio.uint8Array,
      mediaType: speech.audio.mediaType,
      provider: scribe,
      text: TAGGED,
    });

    expect(checked.report.failed).toBeUndefined();
    expect(checked.report.checked).toBe(true);
    expect(checked.report.spans).toBe(1);
    expect(checked.report.removedSeconds).toBeGreaterThan(0.2);
    expect(checked.report.removedSeconds).toBeLessThan(2);

    const segment = checked.segment;
    if (!segment) {
      throw new Error("expected decoded audio from the check");
    }
    const heardAfter = await scribe.transcribe({
      audio: await pcm16ToWav(segment.pcm, segment.sampleRate),
      mediaType: "audio/wav",
    });
    const words = heardAfter.map((w) => skeleton(w.text));
    expect(words).not.toContain("curious");
    expect(words).toEqual(
      expect.arrayContaining(["daring", "dream", "britain", "treaty"])
    );
  });

  it("runs on eleven_v3 with real tags, before forced alignment", async () => {
    const result = await generateSpeech({
      model: elevenlabs("eleven_v3"),
      voice: VOICE,
      text: TAGGED,
      timestamps: true,
      timestampProvider: elevenlabs.forcedAlignment(),
      spokenTagCheck: scribe,
      output: { format: "wav" },
    });

    expect(result.metadata.spokenTags?.failed).toBeUndefined();
    expect(result.metadata.spokenTags?.checked).toBe(true);
    expect(result.metadata.timestampsSource).toBe("aligned");

    // Whether v3 read the tag or not, the returned audio must not contain it.
    const { pcm, sampleRate } = await decodeAudioToPcm16(
      result.audio.uint8Array,
      result.audio.mediaType
    );
    const heard = await scribe.transcribe({
      audio: await pcm16ToWav(pcm, sampleRate),
      mediaType: "audio/wav",
    });
    expect(heard.map((w) => skeleton(w.text))).not.toContain("curious");
  });
});
