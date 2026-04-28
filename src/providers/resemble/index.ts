import { z } from "zod";
import type { AudioOutput } from "../../audio-output.js";
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
  audioTimestampsToWordTimestamps,
  resembleAudioTimestampsSchema,
} from "./alignment.js";

const synthesizeResponseSchema = z.object({
  audio_content: z.string(),
  audio_timestamps: resembleAudioTimestampsSchema.optional(),
});

export interface ResembleSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fallbackSTT?: ResolvedSTTModel;
  fetch?: typeof globalThis.fetch;
}

export const RESEMBLE_PROVIDER_ID = "resemble" as const;

export const RESEMBLE_MODELS: readonly ModelInfo[] = [
  {
    id: "default",
    releaseDate: "2025-09-04",
    languages: [
      "en",
      "ar",
      "da",
      "de",
      "el",
      "es",
      "fi",
      "fr",
      "he",
      "hi",
      "it",
      "ja",
      "ko",
      "ms",
      "nl",
      "no",
      "pl",
      "pt",
      "ru",
      "sv",
      "sw",
      "tr",
      "zh",
    ],
    features: [
      "streaming",
      "open-source",
      "inline-voice-cloning",
      "timestamps",
    ],
  },
] as const;

export class ResembleSpeechProvider implements SpeechProvider<string, string> {
  readonly id = RESEMBLE_PROVIDER_ID;
  readonly defaultModel = "default";

  readonly models = RESEMBLE_MODELS;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: ResembleSpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? "https://f.cluster.resemble.ai";
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
    audio: string;
    mediaType: string;
    providerMetadata?: Record<string, unknown>;
    timestamps?: WordTimestamp[];
  }> {
    const url = `${this.baseURL}/synthesize`;

    const body: Record<string, unknown> = {
      ...options.providerOptions,
      voice_uuid: options.voice,
      data: options.text,
    };

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: resolveApiKey(
          this.apiKey,
          "RESEMBLE_API_KEY",
          "Resemble"
        ),
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);

    // Gate timestamp projection on caller opt-in, not the always-present audio_timestamps field.
    const json = synthesizeResponseSchema.parse(await response.json());

    const timestamps =
      options.includeTimestamps && json.audio_timestamps
        ? audioTimestampsToWordTimestamps(json.audio_timestamps)
        : undefined;

    return {
      audio: json.audio_content,
      mediaType: resembleMediaType(body.output_format),
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
    const url = `${this.baseURL}/stream`;

    const body: Record<string, unknown> = {
      ...options.providerOptions,
      voice_uuid: options.voice,
      data: options.text,
    };

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: resolveApiKey(
          this.apiKey,
          "RESEMBLE_API_KEY",
          "Resemble"
        ),
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);

    if (!response.body) {
      throw new Error(`resemble/${options.modelId}: response has no body`);
    }

    return {
      stream: response.body,
      mediaType: response.headers.get("content-type") ?? "audio/wav",
    };
  }

  getStitchOptions(modelId: string) {
    if (this.models.some((m) => m.id === modelId)) {
      // Pin precision to PCM_16 — Resemble defaults to PCM_32 (float WAV) which the stitch decoder rejects.
      return {
        providerOptions: { precision: "PCM_16" },
        mediaType: "audio/wav",
      };
    }
    return;
  }

  resolveOutputFormat(modelId: string, output: AudioOutput) {
    if (!this.models.some((m) => m.id === modelId)) {
      return;
    }
    switch (output.format) {
      case "wav":
        // Pin precision to PCM_16 — Resemble defaults to PCM_32 (float WAV) which downstream decoders reject.
        return {
          providerOptions: { output_format: "wav", precision: "PCM_16" },
          expectedMediaType: "audio/wav",
        };
      case "mp3":
        return {
          providerOptions: { output_format: "mp3" },
          expectedMediaType: "audio/mpeg",
        };
      case "pcm":
        // No native pcm container; request wav (PCM_16) and let the SDK unwrap via mediabunny.
        return {
          providerOptions: { output_format: "wav", precision: "PCM_16" },
          expectedMediaType: "audio/wav",
        };
      default:
        return;
    }
  }
}

function resembleMediaType(outputFormat: unknown): string {
  switch (typeof outputFormat === "string" ? outputFormat.toLowerCase() : "") {
    case "mp3":
      return "audio/mpeg";
    default:
      return "audio/wav";
  }
}

export function createResemble(config: ResembleSpeechProviderConfig = {}) {
  const provider = new ResembleSpeechProvider(config);
  const fallbackSTT = config.fallbackSTT;

  return function resemble(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
      ...(fallbackSTT && { fallbackSTT }),
    };
  };
}
