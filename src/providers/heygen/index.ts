import { z } from "zod";
import type { AudioOutput } from "../../audio-output.js";
import { NoSpeechGeneratedError, SpeechSDKError } from "../../errors.js";
import {
  handleErrorResponse,
  resolveApiKey,
  SDK_USER_AGENT,
} from "../../provider-utils.js";
import {
  type ModelInfo,
  type ResolvedModel,
  resolveSampleRate,
  type SpeechProvider,
} from "../../speech-provider.js";
import type { ResolvedSTTModel } from "../../speech-to-text-provider.js";

export interface HeyGenSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fallbackSTT?: ResolvedSTTModel;
  fetch?: typeof globalThis.fetch;
}

export const HEYGEN_PROVIDER_ID = "heygen" as const;
const HEYGEN_LANGUAGES = [
  "ar",
  "be",
  "bg",
  "ca",
  "cs",
  "da",
  "de",
  "el",
  "en",
  "es",
  "fa",
  "fi",
  "fr",
  "he",
  "hi",
  "hr",
  "hu",
  "id",
  "it",
  "ja",
  "ko",
  "mk",
  "ms",
  "nl",
  "pl",
  "pt",
  "ro",
  "ru",
  "sk",
  "sl",
  "sr",
  "sv",
  "ta",
  "th",
  "tl",
  "tr",
  "uk",
  "vi",
  "zh",
] as const;

export const HEYGEN_MODELS: readonly ModelInfo[] = [
  {
    id: "heygen-voice-1-turbo",
    releaseDate: "",
    languages: HEYGEN_LANGUAGES,
    features: [],
    maxInputChars: 5000,
  },
  {
    id: "heygen-voice-1-turbo-free",
    releaseDate: "2026-10-21",
    languages: HEYGEN_LANGUAGES,
    features: [],
    maxInputChars: 5000,
  },
  {
    id: "heygen-voice-1",
    releaseDate: "",
    languages: HEYGEN_LANGUAGES,
    features: [],
    maxInputChars: 5000,
  },
];

const speechResponseSchema = z.object({
  data: z.object({
    audio_url: z.url(),
    duration: z.number().nonnegative().optional(),
  }),
});

export class HeyGenSpeechProvider implements SpeechProvider<string, string> {
  readonly id = HEYGEN_PROVIDER_ID;
  readonly defaultModel = "heygen-voice-1";
  readonly models = HEYGEN_MODELS;
  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: HeyGenSpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? "https://api.heygen.com";
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async generate(options: {
    modelId: string;
    text: string;
    voice?: string;
    providerOptions?: Record<string, unknown>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }) {
    if (!options.voice) {
      throw new SpeechSDKError(
        "HeyGen requires an active public or cloned voice ID. Pass it via the voice option."
      );
    }
    const response = await this.fetchFn(`${this.baseURL}/v3/models/audio/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": resolveApiKey(this.apiKey, "HEYGEN_API_KEY", "HeyGen"),
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify({
        ...options.providerOptions,
        model: options.modelId,
        text: options.text,
        voice_id: options.voice,
      }),
      signal: options.abortSignal,
    });
    await handleErrorResponse(response, {
      provider: this.id,
      model: options.modelId,
      stage: "synthesis",
    });
    const { data } = speechResponseSchema.parse(await response.json());
    const audioResponse = await this.fetchFn(data.audio_url, {
      signal: options.abortSignal,
    });
    await handleErrorResponse(audioResponse, {
      provider: this.id,
      model: options.modelId,
      stage: "synthesis",
    });
    const audio = new Uint8Array(await audioResponse.arrayBuffer());
    if (audio.length === 0) {
      throw new NoSpeechGeneratedError("HeyGen returned an empty audio file.", {
        provider: this.id,
        model: options.modelId,
        reason: "provider_empty_response",
      });
    }
    return {
      audio,
      mediaType: "audio/wav",
      audioDurationMs:
        data.duration == null ? undefined : Math.round(data.duration * 1000),
      providerMetadata: {
        requestId: response.headers.get("X-Request-Id"),
        language: response.headers.get("Content-Language"),
      },
    };
  }

  supportedSampleRates(modelId: string): readonly number[] {
    return this.models.some((model) => model.id === modelId) ? [44_100] : [];
  }

  getStitchOptions(modelId: string, options?: { sampleRate?: number }) {
    if (!this.models.some((model) => model.id === modelId)) {
      return;
    }
    resolveSampleRate(
      `heygen/${modelId}`,
      this.supportedSampleRates(modelId),
      options?.sampleRate
    );
    return { providerOptions: {}, mediaType: "audio/wav" };
  }

  resolveOutputFormat(modelId: string, output: AudioOutput) {
    const resolved = this.getStitchOptions(modelId, output);
    if (!resolved) {
      return;
    }
    return {
      providerOptions: resolved.providerOptions,
      expectedMediaType: resolved.mediaType,
    };
  }
}

export function createHeyGen(config: HeyGenSpeechProviderConfig = {}) {
  const provider = new HeyGenSpeechProvider(config);
  return function heygen(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
      ...(config.fallbackSTT && { fallbackSTT: config.fallbackSTT }),
    };
  };
}
