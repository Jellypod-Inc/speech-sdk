import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { cloneVoice } from "../../clone-voice.js";
import type { ResolvedModel } from "../../speech-provider.js";
import { generateSpeech } from "../../generate-speech.js";
import { createCartesia } from "../../providers/cartesia/index.js";
import { createElevenLabs } from "../../providers/elevenlabs/index.js";
import { createFishAudio } from "../../providers/fish-audio/index.js";
import { createInworld } from "../../providers/inworld/index.js";
import { createOpenAI } from "../../providers/openai/index.js";

const SAMPLE_TEXT =
  "The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. " +
  "How vexingly quick daft zebras jump. The five boxing wizards jump quickly every morning.";
const GENERATE_TEXT =
  "This audio was produced by a voice cloned through the Speech SDK end-to-end test.";
const OUT_DIR = join(homedir(), "Downloads", "out");

let sampleAudio: { audio: Uint8Array; mediaType: string };

beforeAll(async () => {
  await mkdir(OUT_DIR, { recursive: true });
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

async function cloneGenerateSave(provider: string, model: ResolvedModel) {
  const cloned = await cloneVoice({
    model,
    name: `sdk-e2e-${Date.now()}`,
    language: "en",
    files: { audio: sampleAudio.audio, mediaType: sampleAudio.mediaType },
  });
  expect(cloned.voiceId.length).toBeGreaterThan(0);

  const speech = await generateSpeech({
    model,
    text: GENERATE_TEXT,
    voice: cloned.voiceId,
    output: { format: "mp3" },
  });
  expect(speech.audio.uint8Array.byteLength).toBeGreaterThan(0);

  await writeFile(
    join(OUT_DIR, `${provider}.mp3`),
    speech.audio.uint8Array
  );
}

describe("voice cloning -> generate -> save mp3", () => {
  it.skipIf(!process.env.ELEVENLABS_API_KEY)("ElevenLabs", async () => {
    await cloneGenerateSave(
      "elevenlabs",
      createElevenLabs()("eleven_multilingual_v2")
    );
  });

  it.skipIf(!process.env.CARTESIA_API_KEY)("Cartesia", async () => {
    await cloneGenerateSave("cartesia", createCartesia()("sonic-3.5"));
  });

  it.skipIf(!process.env.FISH_AUDIO_API_KEY)("Fish Audio", async () => {
    await cloneGenerateSave("fish-audio", createFishAudio()("s2-pro"));
  });

  it.skipIf(!process.env.INWORLD_API_KEY)("Inworld", async () => {
    await cloneGenerateSave("inworld", createInworld()("inworld-tts-1.5-max"));
  });
});
