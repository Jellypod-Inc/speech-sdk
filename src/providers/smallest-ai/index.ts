import {
  handleErrorResponse,
  resolveApiKey,
  SDK_USER_AGENT,
} from "../../provider-utils.js";
import type { ResolvedModel, SpeechProvider } from "../../speech-provider.js";

export interface SmallestAISpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
}

export class SmallestAISpeechProvider
  implements SpeechProvider<string, string>
{
  readonly id = "smallest-ai";
  readonly defaultModel = "lightning-v3.1";

  readonly models = [
    {
      id: "lightning-v3.1",
      releaseDate: "2025-01-01",
      languages: ["en", "hi", "es", "ta"] as const,
      features: [],
    },
  ] as const;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: SmallestAISpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? "https://api.smallest.ai/waves/v1";
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private mediaTypeForFormat(format: unknown): string {
    if (format === "wav") {
      return "audio/wav";
    }
    if (format === "pcm") {
      return "audio/pcm";
    }
    if (format === "mulaw") {
      return "audio/basic";
    }
    return "audio/mpeg";
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
    const outputFormat =
      (options.providerOptions?.output_format as string | undefined) ?? "wav";

    const body: Record<string, unknown> = {
      voice_id: options.voice ?? "magnus",
      language: "auto",
      ...options.providerOptions,
      text: options.text,
      output_format: outputFormat,
    };

    const response = await this.fetchFn(
      `${this.baseURL}/${options.modelId}/get_speech`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resolveApiKey(this.apiKey, "SMALLEST_API_KEY", "Smallest AI")}`,
          "X-User-Agent": SDK_USER_AGENT,
          "X-Source": "jellypod-speech-sdk",
          ...options.headers,
        },
        body: JSON.stringify(body),
        signal: options.abortSignal,
      }
    );

    await handleErrorResponse(response);

    const arrayBuffer = await response.arrayBuffer();
    const mediaType =
      response.headers.get("content-type") ??
      this.mediaTypeForFormat(outputFormat);

    return {
      audio: new Uint8Array(arrayBuffer),
      mediaType,
    };
  }

  getStitchOptions(modelId: string) {
    if (this.models.some((m) => m.id === modelId)) {
      return {
        providerOptions: { output_format: "wav" },
        mediaType: "audio/wav",
      };
    }
    return;
  }
}

export function createSmallestAI(config: SmallestAISpeechProviderConfig = {}) {
  const provider = new SmallestAISpeechProvider(config);
  return function smallestAI(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
    };
  };
}
