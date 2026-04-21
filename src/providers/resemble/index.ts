import {
  handleErrorResponse,
  resolveApiKey,
  SDK_USER_AGENT,
} from "../../provider-utils.js";
import type { ResolvedModel, SpeechProvider } from "../../speech-provider.js";
import type { WordTimestamp } from "../../timestamps.js";
import {
  audioTimestampsToWordTimestamps,
  type ResembleAudioTimestamps,
} from "./alignment.js";

export interface ResembleSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
}

export class ResembleSpeechProvider implements SpeechProvider<string, string> {
  readonly id = "resemble";
  readonly defaultModel = "default";

  readonly models = [
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
        { id: "timestamps", mode: "native" },
      ],
    },
  ] as const;

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

    await handleErrorResponse(response, `resemble/${options.modelId}`);

    // Resemble always returns `audio_timestamps`; gate the projection on
    // the caller's opt-in rather than the presence of the field.
    const json = (await response.json()) as {
      audio_content: string;
      audio_timestamps?: ResembleAudioTimestamps;
    };

    const timestamps =
      options.includeTimestamps && json.audio_timestamps
        ? audioTimestampsToWordTimestamps(json.audio_timestamps)
        : undefined;

    return {
      audio: json.audio_content,
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

    await handleErrorResponse(response, `resemble/${options.modelId}`);

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
      // Resemble's /synthesize defaults to PCM_32 (32-bit float WAV) which
      // the stitch decoder doesn't accept; pin precision to PCM_16 so the
      // returned WAV is 16-bit signed PCM.
      return {
        providerOptions: { precision: "PCM_16" },
        mediaType: "audio/wav",
      };
    }
    return undefined;
  }
}

export function createResemble(config: ResembleSpeechProviderConfig = {}) {
  const provider = new ResembleSpeechProvider(config);

  return function resemble(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
    };
  };
}
