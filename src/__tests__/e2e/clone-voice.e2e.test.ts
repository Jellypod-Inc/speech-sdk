import { beforeAll, describe, expect, it } from "vitest";
import { cloneVoice } from "../../clone-voice.js";
import { generateSpeech } from "../../generate-speech.js";
import { createCartesia } from "../../providers/cartesia/index.js";
import { createElevenLabs } from "../../providers/elevenlabs/index.js";
import { createFishAudio } from "../../providers/fish-audio/index.js";
import { createInworld } from "../../providers/inworld/index.js";
import { createMistral } from "../../providers/mistral/index.js";
import { createOpenAI } from "../../providers/openai/index.js";
import { createXai } from "../../providers/xai/index.js";

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
  expect(sampleAudio.audio.byteLength).toBeGreaterThan(0);
}, 60_000);

function assertCloned(voiceId: string, provider: string) {
  expect(voiceId.length).toBeGreaterThan(0);
  expect(provider.length).toBeGreaterThan(0);
}

describe("voice cloning e2e", () => {
  it.skipIf(!process.env.ELEVENLABS_API_KEY)(
    "clones a voice on ElevenLabs",
    async () => {
      const cloned = await cloneVoice({
        model: createElevenLabs()("eleven_multilingual_v2"),
        name: `sdk-e2e-${Date.now()}`,
        files: { audio: sampleAudio.audio, mediaType: sampleAudio.mediaType },
      });
      assertCloned(cloned.voiceId, cloned.provider);
      expect(cloned.provider).toBe("elevenlabs");
    }
  );

  it.skipIf(!process.env.CARTESIA_API_KEY)(
    "clones a voice on Cartesia",
    async () => {
      const cloned = await cloneVoice({
        model: createCartesia()("sonic-3.5"),
        name: `sdk-e2e-${Date.now()}`,
        language: "en",
        files: { audio: sampleAudio.audio, mediaType: sampleAudio.mediaType },
      });
      assertCloned(cloned.voiceId, cloned.provider);
      expect(cloned.provider).toBe("cartesia");
    }
  );

  it.skipIf(!process.env.FISH_AUDIO_API_KEY)(
    "clones a voice on Fish Audio",
    async () => {
      const cloned = await cloneVoice({
        model: createFishAudio()("s2-pro"),
        name: `sdk-e2e-${Date.now()}`,
        files: { audio: sampleAudio.audio, mediaType: sampleAudio.mediaType },
      });
      assertCloned(cloned.voiceId, cloned.provider);
      expect(cloned.provider).toBe("fish-audio");
    }
  );

  it.skipIf(!process.env.XAI_API_KEY)("clones a voice on xAI", async () => {
    const cloned = await cloneVoice({
      model: createXai()("grok-tts"),
      name: `sdk-e2e-${Date.now()}`,
      language: "en",
      files: { audio: sampleAudio.audio, mediaType: sampleAudio.mediaType },
    });
    assertCloned(cloned.voiceId, cloned.provider);
    expect(cloned.provider).toBe("xai");
  });

  it.skipIf(!process.env.INWORLD_API_KEY)(
    "clones a voice on Inworld",
    async () => {
      const cloned = await cloneVoice({
        model: createInworld()("inworld-tts-1.5-max"),
        name: `sdk-e2e-${Date.now()}`,
        language: "en",
        files: { audio: sampleAudio.audio, mediaType: sampleAudio.mediaType },
      });
      assertCloned(cloned.voiceId, cloned.provider);
      expect(cloned.provider).toBe("inworld");
    }
  );

  it.skipIf(!process.env.MISTRAL_API_KEY)(
    "clones a voice on Mistral",
    async () => {
      const cloned = await cloneVoice({
        model: createMistral()("voxtral-mini-tts-2603"),
        name: `sdk-e2e-${Date.now()}`,
        files: { audio: sampleAudio.audio, mediaType: sampleAudio.mediaType },
      });
      assertCloned(cloned.voiceId, cloned.provider);
      expect(cloned.provider).toBe("mistral");
    }
  );
});
