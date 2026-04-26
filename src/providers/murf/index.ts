import { z } from "zod";
import {
  handleErrorResponse,
  resolveApiKey,
  SDK_USER_AGENT,
} from "../../provider-utils.js";
import type {
  ModelInfo,
  ResolvedModel,
  SpeechProvider,
} from "../../speech-provider.js";
import type { ResolvedSTTModel } from "../../speech-to-text-provider.js";
import type { WordTimestamp } from "../../timestamps.js";
import {
  murfWordDurationSchema,
  wordDurationsToWordTimestamps,
} from "./alignment.js";

const speechResponseSchema = z.object({
  encodedAudio: z.string(),
  audioLengthInSeconds: z.number().optional(),
  wordDurations: z.array(murfWordDurationSchema).optional(),
});

export interface MurfSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fallbackSTT?: ResolvedSTTModel;
  fetch?: typeof globalThis.fetch;
}

export const MURF_PROVIDER_ID = "murf" as const;

export const MURF_MODELS: readonly ModelInfo[] = [
  {
    id: "GEN2",
    releaseDate: "2025-01-01",
    languages: [
      "en",
      "de",
      "es",
      "fr",
      "zh",
      "ar",
      "hi",
      "bn",
      "ta",
      "pt",
      "it",
      "ja",
      "ko",
      "nl",
      "pl",
      "ru",
      "sv",
      "tr",
      "id",
      "ms",
      "tl",
      "cs",
      "fi",
      "th",
      "vi",
      "da",
      "no",
      "ro",
      "el",
      "hu",
      "uk",
      "sk",
      "bg",
    ],
    features: ["streaming", "timestamps"],
  },
  {
    id: "FALCON",
    releaseDate: "2025-01-01",
    languages: ["en"],
    features: ["streaming"],
  },
] as const;

export class MurfSpeechProvider implements SpeechProvider<string, string> {
  readonly id = MURF_PROVIDER_ID;
  readonly defaultModel = "GEN2";

  readonly models = MURF_MODELS;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: MurfSpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? "https://api.murf.ai/v1";
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async generate(options: {
    modelId: string;
    text: string;
    voice?: string;
    providerOptions?: Record<string, unknown>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
    includeTimestamps?: boolean;
  }): Promise<{
    audio: string | Uint8Array;
    audioDurationMs?: number;
    mediaType: string;
    providerMetadata?: Record<string, unknown>;
    timestamps?: WordTimestamp[];
  }> {
    const isFalcon = options.modelId === "FALCON";
    const url = isFalcon
      ? `${this.baseURL}/speech/stream`
      : `${this.baseURL}/speech/generate`;

    const body: Record<string, unknown> = {
      ...options.providerOptions,
      voiceId: options.voice,
      text: options.text,
    };

    if (isFalcon) {
      body.model = "FALCON";
    } else {
      body.encodeAsBase64 = true;
    }

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": resolveApiKey(this.apiKey, "MURF_API_KEY", "Murf"),
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);

    if (isFalcon) {
      const arrayBuffer = await response.arrayBuffer();
      const mediaType = response.headers.get("content-type") ?? "audio/wav";
      return {
        audio: new Uint8Array(arrayBuffer),
        mediaType,
      };
    }

    const json = speechResponseSchema.parse(await response.json());
    const audioDurationMs =
      typeof json.audioLengthInSeconds === "number"
        ? Math.round(json.audioLengthInSeconds * 1000)
        : undefined;
    const timestamps =
      options.includeTimestamps && json.wordDurations
        ? wordDurationsToWordTimestamps(json.wordDurations)
        : undefined;
    return {
      audio: json.encodedAudio,
      audioDurationMs,
      mediaType: "audio/wav",
      timestamps,
    };
  }

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
    const url = `${this.baseURL}/speech/stream`;

    const body: Record<string, unknown> = {
      ...options.providerOptions,
      voiceId: options.voice,
      text: options.text,
      model: options.modelId,
    };

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": resolveApiKey(this.apiKey, "MURF_API_KEY", "Murf"),
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);

    if (!response.body) {
      throw new Error(`murf/${options.modelId}: response has no body`);
    }

    return {
      stream: response.body,
      mediaType: response.headers.get("content-type") ?? "audio/wav",
    };
  }

  getStitchOptions(modelId: string) {
    if (this.models.some((m) => m.id === modelId)) {
      // GEN2 base64 WAV and FALCON streamed WAV both yield audio/wav with no overrides needed.
      return {
        providerOptions: {},
        mediaType: "audio/wav",
      };
    }
    return undefined;
  }
}

export function createMurf(config: MurfSpeechProviderConfig = {}) {
  const provider = new MurfSpeechProvider(config);
  const fallbackSTT = config.fallbackSTT;

  return function murf(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
      ...(fallbackSTT && { fallbackSTT }),
    };
  };
}
