import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { cloneVoice } from "../../clone-voice.js";
import { createCartesia } from "../../providers/cartesia/index.js";
import { createElevenLabs } from "../../providers/elevenlabs/index.js";
import { createFishAudio } from "../../providers/fish-audio/index.js";
import { createGradium } from "../../providers/gradium/index.js";
import { createInworld } from "../../providers/inworld/index.js";
import { createMiniMax } from "../../providers/minimax/index.js";
import { createOpenAI } from "../../providers/openai/index.js";
import { createSmallestAI } from "../../providers/smallest-ai/index.js";
import type { ResolvedModel } from "../../speech-provider.js";
import { generateSpeech } from "./_save-audio.js";

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
}, 60_000);

async function cloneGenerateSave(
  provider: string,
  model: ResolvedModel
): Promise<{ voiceId: string; bytes: number }> {
  const cloned = await cloneVoice({
    model,
    name: `sdk-e2e-${Date.now()}`,
    language: "en",
    files: { audio: sampleAudio.audio, mediaType: sampleAudio.mediaType },
  });

  const speech = await generateSpeech({
    model,
    text: GENERATE_TEXT,
    voice: cloned.voiceId,
    output: { format: "mp3" },
  });

  await writeFile(join(OUT_DIR, `${provider}.mp3`), speech.audio.uint8Array);
  return { voiceId: cloned.voiceId, bytes: speech.audio.uint8Array.byteLength };
}

describe("voice cloning -> generate -> save mp3", () => {
  it.skipIf(!process.env.ELEVENLABS_API_KEY)("ElevenLabs", async () => {
    const r = await cloneGenerateSave(
      "elevenlabs",
      createElevenLabs()("eleven_multilingual_v2")
    );
    expect(r.voiceId.length).toBeGreaterThan(0);
    expect(r.bytes).toBeGreaterThan(0);
  });

  it.skipIf(!process.env.CARTESIA_API_KEY)("Cartesia", async () => {
    const r = await cloneGenerateSave(
      "cartesia",
      createCartesia()("sonic-3.5")
    );
    expect(r.voiceId.length).toBeGreaterThan(0);
    expect(r.bytes).toBeGreaterThan(0);
  });

  it.skipIf(!process.env.FISH_AUDIO_API_KEY)("Fish Audio", async () => {
    const r = await cloneGenerateSave(
      "fish-audio",
      createFishAudio()("s2-pro")
    );
    expect(r.voiceId.length).toBeGreaterThan(0);
    expect(r.bytes).toBeGreaterThan(0);
  });

  it.skipIf(!process.env.INWORLD_API_KEY)("Inworld", async () => {
    const r = await cloneGenerateSave(
      "inworld",
      createInworld()("inworld-tts-1.5-max")
    );
    expect(r.voiceId.length).toBeGreaterThan(0);
    expect(r.bytes).toBeGreaterThan(0);
  });

  it.skipIf(!process.env.MINIMAX_API_KEY)("MiniMax", async () => {
    const r = await cloneGenerateSave(
      "minimax",
      createMiniMax()("speech-2.8-hd")
    );
    expect(r.voiceId.length).toBeGreaterThan(0);
    expect(r.bytes).toBeGreaterThan(0);
  });

  it.skipIf(!process.env.GRADIUM_API_KEY)("Gradium", async () => {
    const r = await cloneGenerateSave("gradium", createGradium()("default"));
    expect(r.voiceId.length).toBeGreaterThan(0);
    expect(r.bytes).toBeGreaterThan(0);
  });

  it.skipIf(!process.env.SMALLEST_API_KEY)("Smallest AI", async () => {
    const r = await cloneGenerateSave(
      "smallest-ai",
      createSmallestAI()("lightning_v3.1")
    );
    expect(r.voiceId.length).toBeGreaterThan(0);
    expect(r.bytes).toBeGreaterThan(0);
  });
});
