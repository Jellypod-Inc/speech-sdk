import { describe, expect, it } from "vitest";
import { decodeAudioToPcm16 } from "../../audio-decode.js";
import { createCartesia } from "../../providers/cartesia/index.js";
import { createDeepgram } from "../../providers/deepgram/index.js";
import { createElevenLabs } from "../../providers/elevenlabs/index.js";
import { createFishAudio } from "../../providers/fish-audio/index.js";
import { createHume } from "../../providers/hume/index.js";
import { createInworld } from "../../providers/inworld/index.js";
import { createMurf } from "../../providers/murf/index.js";
import { createXai } from "../../providers/xai/index.js";
import type { ResolvedModel, Voice } from "../../speech-provider.js";
import { generateSpeech } from "./_save-audio.js";

const INT16_MAX = 32_767;
const PEAK_SAFE_CEIL = Math.floor(INT16_MAX * 0.99);
const HARD_CLIP_NEG = -32_768;
const MIN_PLAUSIBLE_DURATION_S = 1.0;
const MAX_PLAUSIBLE_DURATION_S = 8.0;

const TEST_TEXT =
  "Quick test sentence for verifying audio quality through the speech SDK.";

function peakAbs(pcm: Int16Array): number {
  let m = 0;
  for (const v of pcm) {
    const a = v < 0 ? -v : v;
    if (a > m) {
      m = a;
    }
  }
  return m;
}

function hardClipCount(pcm: Int16Array): number {
  let n = 0;
  for (const v of pcm) {
    if (v === INT16_MAX || v === HARD_CLIP_NEG) {
      n++;
    }
  }
  return n;
}

interface ProviderTarget {
  envKey: string;
  model: () => ResolvedModel<Voice>;
  name: string;
  targetRate: number;
  voice: Voice;
}

// Each provider's `supportedSampleRates` declares what it can natively produce.
// Pick a target rate that is non-trivially > 24kHz so we'd catch any silent downsampling.
const targets: ProviderTarget[] = [
  {
    name: "elevenlabs",
    envKey: "ELEVENLABS_API_KEY",
    model: () => createElevenLabs()("eleven_multilingual_v2"),
    voice: process.env.ELEVENLABS_VOICE_ID ?? "JBFqnCBsd6RMkjVDRZzb",
    targetRate: 48_000,
  },
  {
    name: "cartesia",
    envKey: "CARTESIA_API_KEY",
    model: () => createCartesia()("sonic-2"),
    voice:
      process.env.CARTESIA_VOICE_ID ?? "6ccbfb76-1fc6-48f7-b71d-91ac6298247b",
    targetRate: 48_000,
  },
  {
    name: "deepgram",
    envKey: "DEEPGRAM_API_KEY",
    model: () => createDeepgram()("aura-2"),
    voice: "thalia-en",
    targetRate: 48_000,
  },
  {
    name: "inworld",
    envKey: "INWORLD_API_KEY",
    model: () => createInworld()("inworld-tts-1.5-max"),
    voice: process.env.INWORLD_VOICE_ID ?? "Ashley",
    targetRate: 48_000,
  },
  {
    name: "murf",
    envKey: "MURF_API_KEY",
    model: () => createMurf()("GEN2"),
    voice: "en-US-natalie",
    targetRate: 48_000,
  },
  {
    name: "xai",
    envKey: "XAI_API_KEY",
    model: () => createXai()("grok-tts"),
    voice: "eve",
    targetRate: 48_000,
  },
  {
    name: "hume",
    envKey: "HUME_API_KEY",
    model: () => createHume()("octave-2"),
    voice: "Kora",
    targetRate: 48_000,
  },
  {
    name: "fish-audio",
    envKey: "FISH_AUDIO_API_KEY",
    model: () => createFishAudio()("s2-pro"),
    voice:
      process.env.FISH_AUDIO_VOICE_ID ?? "59e9dc1cb20c452584788a2690c80970",
    targetRate: 44_100,
  },
];

for (const t of targets) {
  describe.skipIf(!process.env[t.envKey])(`${t.name} audio quality e2e`, () => {
    it(`returns WAV @ ${t.targetRate} with rate-matching payload and plausible duration`, async () => {
      const result = await generateSpeech({
        model: t.model(),
        text: TEST_TEXT,
        voice: t.voice,
        output: { format: "wav", sampleRate: t.targetRate },
      });

      expect(result.audio.mediaType).toBe("audio/wav");

      const decoded = await decodeAudioToPcm16(
        result.audio.uint8Array,
        result.audio.mediaType
      );
      expect(decoded.sampleRate).toBe(t.targetRate);

      const durationS = decoded.pcm.length / decoded.sampleRate;
      expect(durationS).toBeGreaterThanOrEqual(MIN_PLAUSIBLE_DURATION_S);
      expect(durationS).toBeLessThanOrEqual(MAX_PLAUSIBLE_DURATION_S);
    });

    it("with volumeDbfs=-16, peak stays under peak-safe ceiling and hard-clip count is 0", async () => {
      const result = await generateSpeech({
        model: t.model(),
        text: TEST_TEXT,
        voice: t.voice,
        output: { format: "wav", sampleRate: t.targetRate },
        volumeDbfs: -16,
      });

      expect(result.audio.mediaType).toBe("audio/wav");

      const decoded = await decodeAudioToPcm16(
        result.audio.uint8Array,
        result.audio.mediaType
      );
      expect(decoded.sampleRate).toBe(t.targetRate);

      const peak = peakAbs(decoded.pcm);
      const clips = hardClipCount(decoded.pcm);

      expect(clips).toBe(0);
      expect(peak).toBeLessThanOrEqual(PEAK_SAFE_CEIL);
    });
  });
}
