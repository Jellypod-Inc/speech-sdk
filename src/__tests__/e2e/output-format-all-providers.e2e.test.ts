import { describe, expect, it } from "vitest";
import type { AudioOutputFormat } from "../../audio-output.js";
import { createCartesia } from "../../providers/cartesia/index.js";
import { createDeepgram } from "../../providers/deepgram/index.js";
import { createElevenLabs } from "../../providers/elevenlabs/index.js";
import { createFal } from "../../providers/fal/index.js";
import { createFishAudio } from "../../providers/fish-audio/index.js";
import { createGoogle } from "../../providers/google/index.js";
import { createHume } from "../../providers/hume/index.js";
import { createInworld } from "../../providers/inworld/index.js";
import { createMistral } from "../../providers/mistral/index.js";
import { createMurf } from "../../providers/murf/index.js";
import { createOpenAI } from "../../providers/openai/index.js";
import { createResemble } from "../../providers/resemble/index.js";
import { createSmallestAI } from "../../providers/smallest-ai/index.js";
import { createXai } from "../../providers/xai/index.js";
import type { ResolvedModel, Voice } from "../../speech-provider.js";
import { generateSpeech } from "./_save-audio.js";

const TEST_TEXT = "Hello, this is a test of the speech SDK output format.";

const RIFF_MAGIC = [0x52, 0x49, 0x46, 0x46] as const;
const WAVE_MAGIC = [0x57, 0x41, 0x56, 0x45] as const;
const MPEG_FRAME_SYNC_BYTE_2_MASK = 0xe0;
const PCM_RATE_MEDIA_TYPE = /^audio\/pcm;rate=\d+/;

function isRiffWave(bytes: Uint8Array): boolean {
  for (let i = 0; i < 4; i++) {
    if (bytes[i] !== RIFF_MAGIC[i] || bytes[8 + i] !== WAVE_MAGIC[i]) {
      return false;
    }
  }
  return true;
}

function isMpegFrameSync(bytes: Uint8Array): boolean {
  // ID3v2 tag (LAME and many encoders prepend this); the actual MPEG frames follow.
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    return true;
  }
  if (bytes[0] !== 0xff) {
    return false;
  }
  // biome-ignore lint/suspicious/noBitwiseOperators: MPEG frame sync test
  const masked = bytes[1] & MPEG_FRAME_SYNC_BYTE_2_MASK;
  return masked === MPEG_FRAME_SYNC_BYTE_2_MASK;
}

interface ProviderTarget {
  envKey: string;
  model: () => ResolvedModel<Voice>;
  name: string;
  voice: Voice;
}

const providers: ProviderTarget[] = [
  {
    name: "openai",
    envKey: "OPENAI_API_KEY",
    model: () => createOpenAI()("tts-1"),
    voice: "alloy",
  },
  {
    name: "elevenlabs",
    envKey: "ELEVENLABS_API_KEY",
    model: () => createElevenLabs()("eleven_multilingual_v2"),
    voice: process.env.ELEVENLABS_VOICE_ID ?? "JBFqnCBsd6RMkjVDRZzb",
  },
  {
    name: "cartesia",
    envKey: "CARTESIA_API_KEY",
    model: () => createCartesia()("sonic-2"),
    voice:
      process.env.CARTESIA_VOICE_ID ?? "6ccbfb76-1fc6-48f7-b71d-91ac6298247b",
  },
  {
    name: "mistral",
    envKey: "MISTRAL_API_KEY",
    model: () => createMistral()("voxtral-mini-tts-2603"),
    voice: "en_paul_neutral",
  },
  {
    name: "xai",
    envKey: "XAI_API_KEY",
    model: () => createXai()("grok-tts"),
    voice: "eve",
  },
  {
    name: "hume",
    envKey: "HUME_API_KEY",
    model: () => createHume()("octave-2"),
    voice: "Kora",
  },
  {
    name: "fal",
    envKey: "FAL_API_KEY",
    model: () => createFal()("kokoro/american-english"),
    voice: "af_heart",
  },
  {
    name: "fish-audio",
    envKey: "FISH_AUDIO_API_KEY",
    model: () => createFishAudio()("s2-pro"),
    voice:
      process.env.FISH_AUDIO_VOICE_ID ?? "59e9dc1cb20c452584788a2690c80970",
  },
  {
    name: "inworld",
    envKey: "INWORLD_API_KEY",
    model: () => createInworld()("inworld-tts-1.5-max"),
    voice: process.env.INWORLD_VOICE_ID ?? "Ashley",
  },
  {
    name: "deepgram",
    envKey: "DEEPGRAM_API_KEY",
    model: () => createDeepgram()("aura-2"),
    voice: "thalia-en",
  },
  {
    name: "resemble",
    envKey: "RESEMBLE_API_KEY",
    model: () => createResemble()("default"),
    voice: process.env.RESEMBLE_VOICE_UUID ?? "fb2d2858",
  },
  {
    name: "murf",
    envKey: "MURF_API_KEY",
    model: () => createMurf()("GEN2"),
    voice: "en-US-natalie",
  },
  {
    name: "google",
    envKey: "GOOGLE_API_KEY",
    model: () => createGoogle()("gemini-2.5-flash-preview-tts"),
    voice: "Kore",
  },
  {
    name: "smallest-ai",
    envKey: "SMALLEST_API_KEY",
    model: () => createSmallestAI()("lightning_v3.1"),
    voice: process.env.SMALLEST_VOICE_ID ?? "magnus",
  },
];

const FORMATS: AudioOutputFormat[] = ["wav", "mp3", "pcm"];

for (const provider of providers) {
  describe.skipIf(!process.env[provider.envKey])(
    `${provider.name} output format e2e`,
    () => {
      for (const format of FORMATS) {
        it(`output: { format: '${format}' } returns valid bytes for that format`, async () => {
          const result = await generateSpeech({
            model: provider.model(),
            text: TEST_TEXT,
            voice: provider.voice,
            output: { format },
          });

          expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);

          if (format === "wav") {
            expect(result.audio.mediaType).toBe("audio/wav");
            expect(isRiffWave(result.audio.uint8Array)).toBe(true);
          } else if (format === "mp3") {
            expect(result.audio.mediaType).toBe("audio/mpeg");
            expect(isMpegFrameSync(result.audio.uint8Array)).toBe(true);
          } else {
            // pcm: mediaType always carries rate parameter; sample-aligned byte count.
            expect(result.audio.mediaType).toMatch(PCM_RATE_MEDIA_TYPE);
            expect(result.audio.uint8Array.byteLength % 2).toBe(0);
          }
        });
      }
    }
  );
}
