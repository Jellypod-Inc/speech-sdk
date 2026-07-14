import type { AudioOutput } from "../../audio-output.js";
import { base64ToUint8Array } from "../../audio-utils.js";
import { SpeechSDKError } from "../../errors.js";
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

const SPEECHIFY_DEFAULT_BASE_URL = "https://api.speechify.ai/v1";
// Speechify synthesizes at a fixed 48 kHz; the API exposes no rate selector.
const SPEECHIFY_OUTPUT_SAMPLE_RATE = 48_000;

export interface SpeechifySpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fallbackSTT?: ResolvedSTTModel;
  fetch?: typeof globalThis.fetch;
}

export const SPEECHIFY_PROVIDER_ID = "speechify" as const;

export const SPEECHIFY_MODELS: readonly ModelInfo[] = [
  {
    id: "simba-english",
    releaseDate: "2025-03-01",
    languages: ["en"],
    features: ["streaming"],
  },
  {
    id: "simba-3.0",
    releaseDate: "2026-01-01",
    languages: ["en"],
    features: ["streaming"],
  },
  {
    id: "simba-multilingual",
    releaseDate: "2025-03-01",
    languages: [
      "en",
      "es",
      "fr",
      "de",
      "pt",
      "it",
      "nl",
      "pl",
      "ru",
      "ja",
      "ko",
      "zh",
      "hi",
      "ar",
      "tr",
      "sv",
      "da",
      "nb",
      "fi",
      "cs",
      "uk",
      "el",
      "he",
      "id",
      "vi",
    ],
    features: ["streaming"],
  },
] as const;

interface SpeechifySpeechResponse {
  audio_data: string;
  audio_format?: string;
}

export class SpeechifySpeechProvider implements SpeechProvider<string, string> {
  readonly id = SPEECHIFY_PROVIDER_ID;
  readonly defaultModel = "simba-english";
  readonly models = SPEECHIFY_MODELS;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: SpeechifySpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? SPEECHIFY_DEFAULT_BASE_URL;
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
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
    mediaType: string;
  }> {
    // /audio/speech base64-encodes the clip in a JSON envelope; /audio/stream
    // returns raw bytes (and rejects wav), so generate() owns the JSON path.
    const response = await this.fetchSpeech(options, "/audio/speech", "wav");
    const payload = (await response.json()) as SpeechifySpeechResponse;
    if (typeof payload.audio_data !== "string") {
      throw new SpeechSDKError("speechify: response missing audio_data");
    }

    const audioFormat =
      payload.audio_format ??
      (options.providerOptions?.audio_format as string | undefined) ??
      "wav";

    return {
      audio: base64ToUint8Array(payload.audio_data),
      mediaType: speechifyMediaType(audioFormat),
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
  }> {
    // wav is unavailable on the stream route; default to mp3.
    const response = await this.fetchSpeech(options, "/audio/stream", "mp3");

    if (!response.body) {
      throw new Error(`speechify/${options.modelId}: response has no body`);
    }

    const audioFormat =
      (options.providerOptions?.audio_format as string | undefined) ?? "mp3";

    return {
      stream: response.body,
      mediaType: speechifyMediaType(audioFormat),
    };
  }

  supportedSampleRates(modelId: string): readonly number[] {
    if (!this.models.some((m) => m.id === modelId)) {
      return [];
    }
    return [SPEECHIFY_OUTPUT_SAMPLE_RATE];
  }

  getStitchOptions(modelId: string, opts?: { sampleRate?: number }) {
    if (!this.models.some((m) => m.id === modelId)) {
      return;
    }
    resolveSampleRate(
      `speechify/${modelId}`,
      this.supportedSampleRates(modelId),
      opts?.sampleRate
    );
    return {
      providerOptions: { audio_format: "wav" },
      mediaType: "audio/wav",
    };
  }

  resolveOutputFormat(modelId: string, output: AudioOutput) {
    if (!this.models.some((m) => m.id === modelId)) {
      return;
    }
    resolveSampleRate(
      `speechify/${modelId}`,
      this.supportedSampleRates(modelId),
      output.sampleRate
    );
    switch (output.format) {
      case "wav":
        return {
          providerOptions: { audio_format: "wav" },
          expectedMediaType: "audio/wav",
        };
      case "mp3":
        return {
          providerOptions: { audio_format: "mp3" },
          expectedMediaType: "audio/mpeg",
        };
      // Speechify has no raw-pcm format; return decodable wav and let the SDK
      // unwrap it to PCM.
      case "pcm":
        return {
          providerOptions: { audio_format: "wav" },
          expectedMediaType: "audio/wav",
        };
      default:
        return;
    }
  }

  private async fetchSpeech(
    options: {
      modelId: string;
      text: string;
      voice?: string;
      providerOptions?: Record<string, unknown>;
      abortSignal?: AbortSignal;
      headers?: Record<string, string>;
    },
    path: string,
    defaultAudioFormat: string
  ): Promise<Response> {
    if (!options.voice) {
      throw new Error(
        `speechify/${options.modelId}: "voice" is required and must be a Speechify voice_id.`
      );
    }

    const body: Record<string, unknown> = {
      audio_format: defaultAudioFormat,
      ...options.providerOptions,
      input: options.text,
      voice_id: options.voice,
      model: options.modelId,
    };

    const response = await this.fetchFn(`${this.baseURL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolveApiKey(this.apiKey, "SPEECHIFY_API_KEY", "Speechify")}`,
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, {
      provider: this.id,
      model: options.modelId,
      stage: "synthesis",
    });
    return response;
  }
}

function speechifyMediaType(audioFormat: string): string {
  switch (audioFormat.toLowerCase()) {
    case "mp3":
      return "audio/mpeg";
    case "ogg":
      return "audio/ogg";
    case "aac":
      return "audio/aac";
    default:
      return "audio/wav";
  }
}

export function createSpeechify(config: SpeechifySpeechProviderConfig = {}) {
  const provider = new SpeechifySpeechProvider(config);
  const fallbackSTT = config.fallbackSTT;

  return function speechify(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
      ...(fallbackSTT && { fallbackSTT }),
    };
  };
}
