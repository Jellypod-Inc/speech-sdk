import { describe, expect, it } from "vitest";
import { CartesiaSpeechProvider } from "../providers/cartesia/index.js";
import { DeepgramSpeechProvider } from "../providers/deepgram/index.js";
import { ElevenLabsSpeechProvider } from "../providers/elevenlabs/index.js";
import { FalSpeechProvider } from "../providers/fal/index.js";
import { FishAudioSpeechProvider } from "../providers/fish-audio/index.js";
import { GoogleSpeechProvider } from "../providers/google/index.js";
import { HumeSpeechProvider } from "../providers/hume/index.js";
import { InworldSpeechProvider } from "../providers/inworld/index.js";
import { MistralSpeechProvider } from "../providers/mistral/index.js";
import { MurfSpeechProvider } from "../providers/murf/index.js";
import { OpenAISpeechProvider } from "../providers/openai/index.js";
import { ResembleSpeechProvider } from "../providers/resemble/index.js";
import { UnrealSpeechProvider } from "../providers/unreal-speech/index.js";
import { XaiSpeechProvider } from "../providers/xai/index.js";

describe("getStitchOptions per provider", () => {
  it("OpenAI returns pcm 24k for tts-1/tts-1-hd/gpt-4o-mini-tts", () => {
    const p = new OpenAISpeechProvider({});
    for (const m of ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"] as const) {
      expect(p.getStitchOptions?.(m)).toEqual({
        providerOptions: { response_format: "pcm" },
        mediaType: "audio/pcm;rate=24000",
      });
    }
  });

  it("ElevenLabs returns pcm_24000 for all supported models", () => {
    const p = new ElevenLabsSpeechProvider({});
    for (const m of [
      "eleven_v3",
      "eleven_multilingual_v2",
      "eleven_flash_v2_5",
      "eleven_flash_v2",
    ] as const) {
      expect(p.getStitchOptions?.(m)).toEqual({
        providerOptions: { output_format: "pcm_24000" },
        mediaType: "audio/pcm;rate=24000",
      });
    }
  });

  it("Google returns audio/wav for all TTS models", () => {
    const p = new GoogleSpeechProvider({});
    for (const m of [
      "gemini-3.1-flash-tts-preview",
      "gemini-2.5-flash-preview-tts",
      "gemini-2.5-pro-preview-tts",
    ] as const) {
      expect(p.getStitchOptions?.(m)?.mediaType).toBe("audio/wav");
    }
  });

  it("Hume returns pcm 48k for octave models (Hume's fixed output rate)", () => {
    const p = new HumeSpeechProvider({});
    for (const m of ["octave-2", "octave-1"] as const) {
      expect(p.getStitchOptions?.(m)).toEqual({
        providerOptions: { format: { type: "pcm" } },
        mediaType: "audio/pcm;rate=48000",
      });
    }
  });

  it("Cartesia returns wav pcm_s16le 24k", () => {
    const p = new CartesiaSpeechProvider({});
    const opts = p.getStitchOptions?.("sonic-3");
    expect(opts?.mediaType).toBe("audio/wav");
    expect(opts?.providerOptions).toEqual({
      output_format: {
        container: "wav",
        encoding: "pcm_s16le",
        sample_rate: 24_000,
      },
    });
  });

  it("Deepgram returns linear16 wav 24k", () => {
    const p = new DeepgramSpeechProvider({});
    expect(p.getStitchOptions?.("aura-2")).toEqual({
      providerOptions: {
        encoding: "linear16",
        sample_rate: 24_000,
        container: "wav",
      },
      mediaType: "audio/wav",
    });
  });

  it("Inworld returns LINEAR16 audio_config 24k", () => {
    const p = new InworldSpeechProvider({});
    const opts = p.getStitchOptions?.("inworld-tts-1.5-max");
    expect(opts?.mediaType).toBe("audio/wav");
    expect(opts?.providerOptions).toEqual({
      audio_config: {
        audio_encoding: "LINEAR16",
        sample_rate_hertz: 24_000,
      },
    });
  });

  it("Fish Audio returns wav format for s2-pro", () => {
    const p = new FishAudioSpeechProvider({});
    expect(p.getStitchOptions?.("s2-pro")).toEqual({
      providerOptions: { format: "wav" },
      mediaType: "audio/wav",
    });
  });

  it("Unreal Speech returns undefined (stitch unsupported)", () => {
    const p = new UnrealSpeechProvider({});
    expect(p.getStitchOptions?.("default")).toBeUndefined();
  });

  it("Murf returns wav for GEN2 and FALCON", () => {
    const p = new MurfSpeechProvider({});
    for (const m of ["GEN2", "FALCON"] as const) {
      expect(p.getStitchOptions?.(m)).toEqual({
        providerOptions: {},
        mediaType: "audio/wav",
      });
    }
  });

  it("Resemble returns wav", () => {
    const p = new ResembleSpeechProvider({});
    expect(p.getStitchOptions?.("default")).toEqual({
      providerOptions: {},
      mediaType: "audio/wav",
    });
  });

  it("fal-ai returns undefined (stitch unsupported)", () => {
    const p = new FalSpeechProvider({});
    expect(p.getStitchOptions?.("dia-tts")).toBeUndefined();
    expect(p.getStitchOptions?.("f5-tts")).toBeUndefined();
  });

  it("Mistral returns undefined (stitch unsupported)", () => {
    const p = new MistralSpeechProvider({});
    expect(p.getStitchOptions?.("voxtral-mini-tts-2603")).toBeUndefined();
  });

  it("xAI returns wav via output_format.codec", () => {
    const p = new XaiSpeechProvider({});
    expect(p.getStitchOptions?.("grok-tts")).toEqual({
      providerOptions: { output_format: { codec: "wav" } },
      mediaType: "audio/wav",
    });
  });

  it("returns undefined for unknown models on every provider", () => {
    const providers = [
      new OpenAISpeechProvider({}),
      new ElevenLabsSpeechProvider({}),
      new GoogleSpeechProvider({}),
      new HumeSpeechProvider({}),
      new CartesiaSpeechProvider({}),
      new DeepgramSpeechProvider({}),
      new InworldSpeechProvider({}),
      new FishAudioSpeechProvider({}),
      new MurfSpeechProvider({}),
      new ResembleSpeechProvider({}),
      new XaiSpeechProvider({}),
    ];
    for (const p of providers) {
      expect(p.getStitchOptions?.("totally-fake-model-id")).toBeUndefined();
    }
  });
});
