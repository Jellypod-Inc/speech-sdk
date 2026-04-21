import { describe, expect, it } from "vitest";
import { generateConversation } from "./_save-audio.js";

const ELEVENLABS_VOICE_A =
  process.env.ELEVENLABS_VOICE_ID ?? "JBFqnCBsd6RMkjVDRZzb";
const ELEVENLABS_VOICE_B =
  process.env.ELEVENLABS_VOICE_ID_B ?? "21m00Tcm4TlvDq8ikWAM";

describe("Conversation timestamps e2e — stitch path", () => {
  it("OpenAI-only stitch with timestamps: on derives per-turn via Whisper, offsets into concatenated audio", {
    timeout: 120_000,
  }, async () => {
    const turn1 = "Hi there, my name is Nova.";
    const turn2 = "And I am Shimmer. Nice to meet you!";
    const turn3 = "Likewise!";
    const gapMs = 300;

    const result = await generateConversation({
      model: "openai/tts-1",
      turns: [
        { voice: "nova", text: turn1 },
        { voice: "shimmer", text: turn2 },
        { voice: "nova", text: turn3 },
      ],
      gapMs,
      timestamps: "on",
    });

    expect(result.timestamps).toBeDefined();
    const words = result.timestamps ?? [];
    expect(words.length).toBeGreaterThan(0);

    // Monotonic + valid word shape.
    for (const w of words) {
      expect(w.text.length).toBeGreaterThan(0);
      expect(w.end).toBeGreaterThanOrEqual(w.start);
    }
    for (let i = 1; i < words.length; i++) {
      expect(words[i]?.start).toBeGreaterThanOrEqual(words[i - 1]?.start ?? 0);
    }

    // Last word should end near the total audio duration.
    const durSec = (result.metadata.audioDurationMs ?? 0) / 1000;
    const lastEnd = words.at(-1)?.end ?? 0;
    // Generous tolerance because Whisper timestamps drift slightly past
    // the end of the synthesized region.
    expect(lastEnd).toBeLessThanOrEqual(durSec + 1);
    expect(lastEnd).toBeGreaterThan(durSec * 0.5);
  });

  it("cross-provider stitch (ElevenLabs native + OpenAI derived) yields full timestamp coverage on timestamps: on", {
    timeout: 180_000,
  }, async () => {
    const result = await generateConversation({
      turns: [
        {
          model: "elevenlabs/eleven_flash_v2",
          voice: ELEVENLABS_VOICE_A,
          text: "Hello from ElevenLabs.",
        },
        {
          model: "openai/tts-1",
          voice: "nova",
          text: "And hello from OpenAI.",
        },
        {
          model: "elevenlabs/eleven_flash_v2",
          voice: ELEVENLABS_VOICE_B,
          text: "Together we work.",
        },
      ],
      gapMs: 200,
      timestamps: "on",
    });

    expect(result.timestamps).toBeDefined();
    const words = result.timestamps ?? [];
    // Every word from every turn should be represented.
    expect(words.length).toBeGreaterThanOrEqual(8);

    // Offsets are monotonically non-decreasing across turn boundaries.
    for (let i = 1; i < words.length; i++) {
      expect(words[i]?.start).toBeGreaterThanOrEqual(words[i - 1]?.start ?? 0);
    }

    // No word should land past the concatenated audio duration.
    const durSec = (result.metadata.audioDurationMs ?? 0) / 1000;
    expect(words.at(-1)?.end ?? 0).toBeLessThanOrEqual(durSec + 1);
  });

  it("cross-provider stitch across newly-native providers (Murf + Hume) yields auto-mode timestamps with no STT round-trip", {
    timeout: 180_000,
  }, async () => {
    const result = await generateConversation({
      turns: [
        {
          model: "murf/GEN2",
          voice: "en-US-natalie",
          text: "Murf returns wordDurations natively.",
        },
        {
          model: "hume/octave-2",
          voice: "Kora",
          text: "Hume Octave-2 returns alignment too.",
        },
      ],
      gapMs: 200,
      timestamps: "auto",
    });

    expect(result.timestamps).toBeDefined();
    const words = result.timestamps ?? [];
    // Both turns should contribute words — auto mode requires native on every turn.
    expect(words.length).toBeGreaterThanOrEqual(8);

    // Offsets are monotonically non-decreasing across turn boundaries.
    for (let i = 1; i < words.length; i++) {
      const cur = words[i];
      const prev = words[i - 1];
      if (cur && prev) {
        expect(cur.start).toBeGreaterThanOrEqual(prev.start);
      }
    }

    // No word should land past the concatenated audio duration.
    const durSec = (result.metadata.audioDurationMs ?? 0) / 1000;
    expect(words.at(-1)?.end ?? 0).toBeLessThanOrEqual(durSec + 1);
  });

  it("auto mode with mixed native/derived providers returns undefined (all-or-nothing)", {
    timeout: 120_000,
  }, async () => {
    const result = await generateConversation({
      turns: [
        {
          model: "elevenlabs/eleven_flash_v2",
          voice: ELEVENLABS_VOICE_A,
          text: "ElevenLabs has native timestamps.",
        },
        {
          model: "openai/tts-1",
          voice: "nova",
          text: "OpenAI does not, in auto mode.",
        },
      ],
      timestamps: "auto",
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    expect(result.timestamps).toBeUndefined();
  });
});
