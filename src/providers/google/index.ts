import { z } from "zod";
import { stripAudioTags } from "../../audio-tags.js";
import { parseMediaTypeParam, wrapPcm16Mono } from "../../audio-utils.js";
import { SpeechSDKError } from "../../errors.js";
import {
  handleErrorResponse,
  resolveApiKey,
  SDK_USER_AGENT,
} from "../../provider-utils.js";
import {
  hasFeature,
  type ModelInfo,
  type ResolvedModel,
  type SpeechProvider,
} from "../../speech-provider.js";
import type { ResolvedSTTModel } from "../../speech-to-text-provider.js";

// Both /generateContent endpoints (single-speaker and multi-speaker) return the
// same shape; differences in upstream nullability are handled by tolerating
// missing intermediate fields.
const generateContentResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z
              .array(
                z.object({
                  inlineData: z
                    .object({ data: z.string(), mimeType: z.string() })
                    .optional(),
                })
              )
              .optional(),
          })
          .optional(),
      })
    )
    .optional(),
});

const DEFAULT_GEMINI_SAMPLE_RATE = 24_000;

function base64ToBytes(b64: string): Uint8Array {
  const binaryString = atob(b64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export interface GoogleSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fallbackSTT?: ResolvedSTTModel;
  fetch?: typeof globalThis.fetch;
}

export const GOOGLE_PROVIDER_ID = "google" as const;

const GOOGLE_GEMINI_2_5_LANGUAGES = [
  "en",
  "fr",
  "de",
  "es",
  "pt",
  "zh",
  "ja",
  "ko",
  "hi",
  "it",
  "nl",
  "pl",
  "ru",
  "sv",
  "tr",
  "id",
  "ar",
  "cs",
  "da",
  "fi",
  "el",
  "hu",
  "ro",
  "uk",
] as const;

const GOOGLE_GEMINI_3_1_LANGUAGES = [
  "af",
  "am",
  "ar",
  "az",
  "be",
  "bg",
  "bn",
  "ca",
  "ceb",
  "cmn",
  "cs",
  "da",
  "de",
  "el",
  "en",
  "es",
  "et",
  "eu",
  "fa",
  "fi",
  "fil",
  "fr",
  "gl",
  "gu",
  "he",
  "hi",
  "hr",
  "ht",
  "hu",
  "hy",
  "id",
  "is",
  "it",
  "ja",
  "jv",
  "ka",
  "kn",
  "ko",
  "kok",
  "la",
  "lb",
  "lo",
  "lt",
  "lv",
  "mai",
  "mg",
  "mk",
  "ml",
  "mn",
  "mr",
  "ms",
  "my",
  "nb",
  "ne",
  "nl",
  "nn",
  "or",
  "pa",
  "pl",
  "ps",
  "pt",
  "ro",
  "ru",
  "sd",
  "si",
  "sk",
  "sl",
  "sq",
  "sr",
  "sv",
  "sw",
  "ta",
  "te",
  "th",
  "tr",
  "uk",
  "ur",
  "vi",
] as const;

export const GOOGLE_MODELS: readonly ModelInfo[] = [
  {
    id: "gemini-3.1-flash-tts-preview",
    releaseDate: "2026-04-15",
    languages: GOOGLE_GEMINI_3_1_LANGUAGES,
    features: ["streaming", "audio-tags"],
  },
  {
    id: "gemini-2.5-flash-preview-tts",
    releaseDate: "2025-05-01",
    languages: GOOGLE_GEMINI_2_5_LANGUAGES,
    features: ["streaming"],
  },
  {
    id: "gemini-2.5-pro-preview-tts",
    releaseDate: "2025-05-01",
    languages: GOOGLE_GEMINI_2_5_LANGUAGES,
    features: ["streaming"],
  },
] as const;

export class GoogleSpeechProvider implements SpeechProvider<string, string> {
  readonly id = GOOGLE_PROVIDER_ID;
  readonly defaultModel = "gemini-2.5-flash-preview-tts";

  readonly models = GOOGLE_MODELS;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: GoogleSpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL =
      config.baseURL ?? "https://generativelanguage.googleapis.com/v1beta";
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  // Gemini 3.1 Flash TTS supports inline audio tags (e.g. [whispers],
  // [shouting], [sighs], [laugh]) natively — pass them through verbatim.
  // Older Gemini TTS models do not, so strip them with a warning.
  processAudioTags(
    text: string,
    modelId: string
  ): { text: string; warnings: string[] } {
    if (
      this.models.some((m) => m.id === modelId && hasFeature(m, "audio-tags"))
    ) {
      return { text, warnings: [] };
    }
    return stripAudioTags(text, `google/${modelId}`);
  }

  async generate(options: {
    modelId: string;
    text: string;
    voice?: string;
    providerOptions?: Record<string, unknown>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<{
    audio: Uint8Array;
    audioDurationMs?: number;
    mediaType: string;
    providerMetadata?: Record<string, unknown>;
  }> {
    const apiKey = resolveApiKey(this.apiKey, "GOOGLE_API_KEY", "Google");

    const voiceName = options.voice ?? "Kore";

    const speechConfig: Record<string, unknown> = {
      voice_config: {
        prebuilt_voice_config: {
          voice_name: voiceName,
        },
      },
    };

    const body: Record<string, unknown> = {
      contents: [
        {
          role: "user",
          parts: [{ text: options.text }],
        },
      ],
      generationConfig: {
        responseModalities: ["audio"],
        speech_config: speechConfig,
        ...options.providerOptions,
      },
    };

    const url = `${this.baseURL}/models/${options.modelId}:generateContent?key=${apiKey}`;

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);

    const json = generateContentResponseSchema.parse(await response.json());

    const part = json.candidates?.[0]?.content?.parts?.find(
      (p) => p.inlineData != null
    );

    if (!part?.inlineData) {
      throw new Error("No audio data in Gemini TTS response");
    }

    // Gemini returns raw 16-bit mono PCM. Wrap in a WAV container so
    // the audio is directly playable by any client.
    const sampleRate =
      parseMediaTypeParam(part.inlineData.mimeType ?? "", "rate") ??
      DEFAULT_GEMINI_SAMPLE_RATE;
    const pcm = base64ToBytes(part.inlineData.data);
    const wav = await wrapPcm16Mono(pcm, sampleRate);

    return {
      audio: wav,
      mediaType: "audio/wav",
    };
  }

  // Gemini's `streamGenerateContent` endpoint does not actually stream TTS
  // audio progressively — the server synthesizes the full clip, then flushes
  // it in a single burst. Time-to-first-byte matches `generateContent`, and
  // the user-perceived behavior is identical. Rather than duplicate the
  // request logic and deal with SSE parsing + chunked WAV assembly, we
  // delegate to `generate()` and wrap the result in a single-chunk
  // ReadableStream. True progressive Gemini TTS is only available via the
  // Live API (`bidiGenerateContent`, WebSocket) on native-audio models,
  // which is a separate integration not wired up in this SDK.
  async stream(options: {
    modelId: string;
    text: string;
    voice?: string;
    providerOptions?: Record<string, unknown>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<{
    stream: ReadableStream<Uint8Array>;
    mediaType: string;
    providerMetadata?: Record<string, unknown>;
  }> {
    const { audio, mediaType, providerMetadata } = await this.generate(options);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(audio);
        controller.close();
      },
    });
    return { stream, mediaType, providerMetadata };
  }

  getStitchOptions(modelId: string) {
    if (this.models.some((m) => m.id === modelId)) {
      // Gemini TTS returns raw PCM that this provider wraps into WAV before
      // returning to callers, so stitch decoding uses the WAV codepath.
      return {
        providerOptions: {},
        mediaType: "audio/wav",
      };
    }
    return undefined;
  }

  dialogueCapabilities(modelId: string) {
    if (this.models.some((m) => m.id === modelId)) {
      // Gemini multi-speaker TTS requires exactly 2 unique voices
      // (empirically verified — API validator: "enabled_voices must equal 2").
      return { minVoices: 2, maxVoices: 2 };
    }
    return undefined;
  }

  async generateDialogue(options: {
    modelId: string;
    turns: readonly { voice: string; text: string }[];
    providerOptions?: Record<string, unknown>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<{
    audio: Uint8Array;
    mediaType: string;
    providerMetadata?: Record<string, unknown>;
  }> {
    const apiKey = resolveApiKey(this.apiKey, "GOOGLE_API_KEY", "Google");

    const voiceToLabel = new Map<string, string>();
    const labelled: string[] = [];
    for (const turn of options.turns) {
      let label = voiceToLabel.get(turn.voice);
      if (!label) {
        label = `Speaker${voiceToLabel.size + 1}`;
        voiceToLabel.set(turn.voice, label);
      }
      labelled.push(`${label}: ${turn.text}`);
    }
    const text = labelled.join("\n");

    const speakerVoiceConfigs = Array.from(voiceToLabel.entries()).map(
      ([voiceName, speaker]) => ({
        speaker,
        voice_config: {
          prebuilt_voice_config: { voice_name: voiceName },
        },
      })
    );

    const body: Record<string, unknown> = {
      contents: [{ role: "user", parts: [{ text }] }],
      generationConfig: {
        responseModalities: ["audio"],
        speech_config: {
          multi_speaker_voice_config: {
            speaker_voice_configs: speakerVoiceConfigs,
          },
        },
        ...options.providerOptions,
      },
    };

    const url = `${this.baseURL}/models/${options.modelId}:generateContent?key=${apiKey}`;

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);

    const json = generateContentResponseSchema.parse(await response.json());
    const part = json.candidates?.[0]?.content?.parts?.find(
      (p) => p.inlineData?.data
    );
    if (!part?.inlineData) {
      throw new SpeechSDKError(
        `google/${options.modelId}: no inline audio in response`
      );
    }

    const pcm = base64ToBytes(part.inlineData.data);
    const sampleRate =
      parseMediaTypeParam(part.inlineData.mimeType ?? "", "rate") ??
      DEFAULT_GEMINI_SAMPLE_RATE;
    const wav = await wrapPcm16Mono(pcm, sampleRate);

    return {
      audio: wav,
      mediaType: "audio/wav",
    };
  }
}

export function createGoogle(config: GoogleSpeechProviderConfig = {}) {
  const provider = new GoogleSpeechProvider(config);
  const fallbackSTT = config.fallbackSTT;

  return function google(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
      ...(fallbackSTT && { fallbackSTT }),
    };
  };
}
