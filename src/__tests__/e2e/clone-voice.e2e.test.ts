import { beforeAll, describe, expect, it } from "vitest";
import { cloneVoice } from "../../clone-voice.js";
import { createCartesia } from "../../providers/cartesia/index.js";
import { createElevenLabs } from "../../providers/elevenlabs/index.js";
import { createFishAudio } from "../../providers/fish-audio/index.js";
import { createGradium } from "../../providers/gradium/index.js";
import { createInworld } from "../../providers/inworld/index.js";
import { createMiniMax } from "../../providers/minimax/index.js";
import { createMistral } from "../../providers/mistral/index.js";
import { createOpenAI } from "../../providers/openai/index.js";
import { createSmallestAI } from "../../providers/smallest-ai/index.js";
import { createXai } from "../../providers/xai/index.js";
import { generateSpeech } from "./_save-audio.js";

const SAMPLE_TEXT =
  "The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. " +
  "How vexingly quick daft zebras jump. The five boxing wizards jump quickly every morning.";

let sampleAudio: { audio: Uint8Array; mediaType: string };

beforeAll(async () => {
  const result = await generateSpeech({
    model: createOpenAI()("gpt-4o-mini-tts"),
    text: SAMPLE_TEXT,
    voice: "alloy",
  });
  sampleAudio = {
    audio: result.audio.uint8Array,
    mediaType: result.audio.mediaType,
  };
}, 60_000);

function files() {
  return { audio: sampleAudio.audio, mediaType: sampleAudio.mediaType };
}

describe("voice cloning e2e", () => {
  it.skipIf(!process.env.ELEVENLABS_API_KEY)(
    "clones a voice on ElevenLabs",
    async () => {
      const cloned = await cloneVoice({
        provider: createElevenLabs(),
        name: `sdk-e2e-${Date.now()}`,
        files: files(),
      });
      expect(cloned.voiceId.length).toBeGreaterThan(0);
      expect(cloned.provider).toBe("elevenlabs");
    }
  );

  it.skipIf(!process.env.CARTESIA_API_KEY)(
    "clones a voice on Cartesia",
    async () => {
      const cloned = await cloneVoice({
        provider: createCartesia(),
        name: `sdk-e2e-${Date.now()}`,
        language: "en",
        files: files(),
      });
      expect(cloned.voiceId.length).toBeGreaterThan(0);
      expect(cloned.provider).toBe("cartesia");
    }
  );

  it.skipIf(!process.env.FISH_AUDIO_API_KEY)(
    "clones a voice on Fish Audio",
    async () => {
      const cloned = await cloneVoice({
        provider: createFishAudio(),
        name: `sdk-e2e-${Date.now()}`,
        files: files(),
      });
      expect(cloned.voiceId.length).toBeGreaterThan(0);
      expect(cloned.provider).toBe("fish-audio");
    }
  );

  it.skipIf(!process.env.XAI_API_KEY)("clones a voice on xAI", async () => {
    const cloned = await cloneVoice({
      provider: createXai(),
      name: `sdk-e2e-${Date.now()}`,
      language: "en",
      files: files(),
    });
    expect(cloned.voiceId.length).toBeGreaterThan(0);
    expect(cloned.provider).toBe("xai");
  });

  it.skipIf(!process.env.INWORLD_API_KEY)(
    "clones a voice on Inworld",
    async () => {
      const cloned = await cloneVoice({
        provider: createInworld(),
        name: `sdk-e2e-${Date.now()}`,
        language: "en",
        files: files(),
      });
      expect(cloned.voiceId.length).toBeGreaterThan(0);
      expect(cloned.provider).toBe("inworld");
    }
  );

  it.skipIf(!process.env.MISTRAL_API_KEY)(
    "clones a voice on Mistral",
    async () => {
      const cloned = await cloneVoice({
        provider: createMistral(),
        name: `sdk-e2e-${Date.now()}`,
        files: files(),
      });
      expect(cloned.voiceId.length).toBeGreaterThan(0);
      expect(cloned.provider).toBe("mistral");
    }
  );

  it.skipIf(!process.env.MINIMAX_API_KEY)(
    "clones a voice on MiniMax",
    async () => {
      const cloned = await cloneVoice({
        provider: createMiniMax(),
        name: `sdke2e${Date.now()}`,
        language: "en",
        files: files(),
      });
      expect(cloned.voiceId.length).toBeGreaterThan(0);
      expect(cloned.provider).toBe("minimax");
    }
  );

  it.skipIf(!process.env.GRADIUM_API_KEY)(
    "clones a voice on Gradium",
    async () => {
      const cloned = await cloneVoice({
        provider: createGradium(),
        name: `sdk-e2e-${Date.now()}`,
        language: "en",
        files: files(),
      });
      expect(cloned.voiceId.length).toBeGreaterThan(0);
      expect(cloned.provider).toBe("gradium");
    }
  );

  it.skipIf(!process.env.SMALLEST_API_KEY)(
    "clones a voice on Smallest AI",
    async () => {
      const cloned = await cloneVoice({
        provider: createSmallestAI(),
        name: `sdk-e2e-${Date.now()}`,
        language: "en",
        files: files(),
      });
      expect(cloned.voiceId.length).toBeGreaterThan(0);
      expect(cloned.provider).toBe("smallest-ai");
    }
  );
});
