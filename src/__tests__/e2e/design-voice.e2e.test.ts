import { describe, expect, it } from "vitest";
import { designVoice } from "../../design-voice.js";
import { createElevenLabs } from "../../providers/elevenlabs/index.js";
import { createFal } from "../../providers/fal/index.js";
import { createFishAudio } from "../../providers/fish-audio/index.js";
import { createHume } from "../../providers/hume/index.js";
import { createInworld } from "../../providers/inworld/index.js";
import { createMiniMax } from "../../providers/minimax/index.js";
import { createResemble } from "../../providers/resemble/index.js";

const DESCRIPTION =
  "A warm, confident, middle-aged narrator with a subtle British accent, calm and authoritative.";
const PREVIEW_TEXT =
  "In the beginning, there was only silence, and then a single voice broke through the dark.";

describe("voice design e2e", () => {
  it.skipIf(!process.env.ELEVENLABS_API_KEY)(
    "designs a voice on ElevenLabs",
    async () => {
      const designed = await designVoice({
        provider: createElevenLabs(),
        name: `sdk-e2e-${Date.now()}`,
        description: DESCRIPTION,
        previewText: PREVIEW_TEXT,
      });
      expect(designed.voiceId.length).toBeGreaterThan(0);
      expect(designed.provider).toBe("elevenlabs");
    },
    60_000
  );

  it.skipIf(!process.env.MINIMAX_API_KEY)(
    "designs a voice on MiniMax",
    async () => {
      const designed = await designVoice({
        provider: createMiniMax(),
        name: `sdke2e${Date.now()}`,
        description: DESCRIPTION,
        previewText: PREVIEW_TEXT,
      });
      expect(designed.voiceId.length).toBeGreaterThan(0);
      expect(designed.provider).toBe("minimax");
    },
    60_000
  );

  it.skipIf(!process.env.FAL_API_KEY)(
    "designs a voice on Fal",
    async () => {
      const designed = await designVoice({
        provider: createFal(),
        name: `sdk-e2e-${Date.now()}`,
        description: DESCRIPTION,
        previewText: PREVIEW_TEXT,
      });
      expect(designed.voiceId.length).toBeGreaterThan(0);
      expect(designed.provider).toBe("fal-ai");
    },
    60_000
  );

  it.skipIf(!process.env.HUME_API_KEY)(
    "designs a voice on Hume",
    async () => {
      const designed = await designVoice({
        provider: createHume(),
        name: `sdk-e2e-${Date.now()}`,
        description: DESCRIPTION,
        previewText: PREVIEW_TEXT,
      });
      expect(designed.voiceId.length).toBeGreaterThan(0);
      expect(designed.provider).toBe("hume");
    },
    60_000
  );

  it.skipIf(!process.env.INWORLD_API_KEY)(
    "designs a voice on Inworld",
    async () => {
      const designed = await designVoice({
        provider: createInworld(),
        name: `sdk-e2e-${Date.now()}`,
        description: DESCRIPTION,
        language: "en",
        previewText: PREVIEW_TEXT,
      });
      expect(designed.voiceId.length).toBeGreaterThan(0);
      expect(designed.provider).toBe("inworld");
    },
    60_000
  );

  it.skipIf(!process.env.RESEMBLE_API_KEY)(
    "designs a voice on Resemble",
    async () => {
      const designed = await designVoice({
        provider: createResemble(),
        name: `sdk-e2e-${Date.now()}`,
        description: DESCRIPTION,
      });
      expect(designed.voiceId.length).toBeGreaterThan(0);
      expect(designed.provider).toBe("resemble");
    },
    60_000
  );

  it.skipIf(!process.env.FISH_AUDIO_API_KEY)(
    "designs a voice on Fish Audio",
    async () => {
      const designed = await designVoice({
        provider: createFishAudio(),
        name: `sdk-e2e-${Date.now()}`,
        description: DESCRIPTION,
        previewText: PREVIEW_TEXT,
      });
      expect(designed.voiceId.length).toBeGreaterThan(0);
      expect(designed.provider).toBe("fish-audio");
    },
    60_000
  );
});
