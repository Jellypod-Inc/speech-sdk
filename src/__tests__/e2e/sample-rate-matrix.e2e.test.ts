import { describe, expect, it } from "vitest";
import { decodeAudioToPcm16 } from "../../audio-decode.js";
import { ApiError, UnsupportedSampleRateError } from "../../errors.js";
import { createCartesia } from "../../providers/cartesia/index.js";
import { createDeepgram } from "../../providers/deepgram/index.js";
import { createElevenLabs } from "../../providers/elevenlabs/index.js";
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

// Opt-in: this sweep makes one billed API call per provider × supported rate ×
// format. Run with SPEECH_SDK_E2E_RATE_MATRIX=1 (plus the provider keys you want).
const MATRIX_ENABLED = Boolean(process.env.SPEECH_SDK_E2E_RATE_MATRIX);

const TEST_TEXT =
  "Quick test sentence for verifying sample rate handling through the speech SDK.";
const MIN_PLAUSIBLE_DURATION_S = 0.3;
const LOW_RATE_HZ = 8000;

const MPEG_FRAME_SYNC_BYTE_2_MASK = 0xe0;
const ID3_MAGIC = [0x49, 0x44, 0x33] as const;

function isMpegFrameSync(bytes: Uint8Array): boolean {
  // LAME (and the mediabunny build) prepend an ID3v2 tag; the MPEG frames follow.
  if (
    bytes[0] === ID3_MAGIC[0] &&
    bytes[1] === ID3_MAGIC[1] &&
    bytes[2] === ID3_MAGIC[2]
  ) {
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
    name: "murf-gen2",
    envKey: "MURF_API_KEY",
    model: () => createMurf()("GEN2"),
    voice: "en-US-natalie",
  },
  {
    name: "murf-falcon",
    envKey: "MURF_API_KEY",
    model: () => createMurf()("FALCON"),
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
    model: () => createSmallestAI()("lightning-v3.1"),
    voice: process.env.SMALLEST_VOICE_ID ?? "magnus",
  },
];

function ratesFor(target: ProviderTarget): readonly number[] {
  const resolved = target.model();
  return resolved.provider.supportedSampleRates?.(resolved.modelId) ?? [];
}

for (const provider of providers) {
  const enabled = MATRIX_ENABLED && Boolean(process.env[provider.envKey]);
  describe.skipIf(!enabled)(`${provider.name} sample-rate matrix`, () => {
    const rates = ratesFor(provider);

    // WAV is the authoritative check: the RIFF header carries the real rate the
    // provider returned, so a silent downsample/mismatch fails here.
    for (const rate of rates) {
      it(`wav @ ${rate} Hz → decoded audio is exactly ${rate} Hz`, async () => {
        const result = await generateSpeech({
          model: provider.model(),
          text: TEST_TEXT,
          voice: provider.voice,
          output: { format: "wav", sampleRate: rate },
        });
        expect(result.audio.mediaType).toBe("audio/wav");
        const decoded = await decodeAudioToPcm16(
          result.audio.uint8Array,
          result.audio.mediaType
        );
        expect(decoded.sampleRate).toBe(rate);
        expect(decoded.pcm.length / decoded.sampleRate).toBeGreaterThan(
          MIN_PLAUSIBLE_DURATION_S
        );
      });
    }

    for (const rate of rates) {
      it(`pcm @ ${rate} Hz → mediaType carries rate ${rate}, sample-aligned`, async () => {
        const result = await generateSpeech({
          model: provider.model(),
          text: TEST_TEXT,
          voice: provider.voice,
          output: { format: "pcm", sampleRate: rate },
        });
        expect(result.audio.mediaType).toMatch(
          new RegExp(`^audio/pcm;rate=${rate}(?:;|$)`)
        );
        expect(result.audio.uint8Array.byteLength % 2).toBe(0);
        const decoded = await decodeAudioToPcm16(
          result.audio.uint8Array,
          result.audio.mediaType
        );
        expect(decoded.pcm.length / rate).toBeGreaterThan(
          MIN_PLAUSIBLE_DURATION_S
        );
      });
    }

    // MP3 rate sets vary by provider and are often narrower than wav/pcm. A
    // request is correct if it either returns a valid MPEG stream, is rejected
    // up front by the SDK (UnsupportedSampleRateError), or is rejected by the
    // provider (ApiError) — never a silent wrong-rate file. Some providers don't
    // publish their MP3 rate subset, so the SDK can't pre-validate it.
    for (const rate of rates) {
      it(`mp3 @ ${rate} Hz → valid mpeg or rate rejection`, async () => {
        let result: Awaited<ReturnType<typeof generateSpeech>>;
        try {
          result = await generateSpeech({
            model: provider.model(),
            text: TEST_TEXT,
            voice: provider.voice,
            output: { format: "mp3", sampleRate: rate },
          });
        } catch (err) {
          expect(
            err instanceof UnsupportedSampleRateError || err instanceof ApiError
          ).toBe(true);
          return;
        }
        expect(result.audio.mediaType).toBe("audio/mpeg");
        expect(isMpegFrameSync(result.audio.uint8Array)).toBe(true);
      });
    }

    // Regression for the local MP3-conversion crash at sub-16kHz rates: volumeDbfs
    // forces a decodable wav/pcm wire format, then a local MP3 encode at that rate.
    it.skipIf(!rates.includes(LOW_RATE_HZ))(
      `mp3 @ ${LOW_RATE_HZ} Hz with volumeDbfs encodes without crashing`,
      async () => {
        const result = await generateSpeech({
          model: provider.model(),
          text: TEST_TEXT,
          voice: provider.voice,
          output: { format: "mp3", sampleRate: LOW_RATE_HZ },
          volumeDbfs: -16,
        });
        expect(result.audio.mediaType).toBe("audio/mpeg");
        expect(isMpegFrameSync(result.audio.uint8Array)).toBe(true);
      }
    );
  });
}
