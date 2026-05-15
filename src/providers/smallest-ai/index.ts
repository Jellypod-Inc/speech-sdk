import type { AudioOutput } from "../../audio-output.js";
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
      `${this.baseURL}/${encodeURIComponent(options.modelId)}/get_speech`,
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
      smallestAIMediaType(outputFormat, body.sample_rate);

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

  resolveOutputFormat(modelId: string, output: AudioOutput) {
    if (!this.models.some((m) => m.id === modelId)) {
      return;
    }
    switch (output.format) {
      case "wav":
        return {
          providerOptions: { output_format: "wav", sample_rate: 24_000 },
          expectedMediaType: "audio/wav",
        };
      case "mp3":
        return {
          providerOptions: { output_format: "mp3", sample_rate: 24_000 },
          expectedMediaType: "audio/mpeg",
        };
      case "pcm":
        return {
          providerOptions: { output_format: "pcm", sample_rate: 24_000 },
          expectedMediaType: "audio/pcm;rate=24000",
        };
      default:
        return;
    }
  }
}

function smallestAIMediaType(format: unknown, sampleRate: unknown): string {
  const rate = typeof sampleRate === "number" ? sampleRate : 24_000;
  switch (typeof format === "string" ? format.toLowerCase() : "wav") {
    case "mp3":
      return "audio/mpeg";
    case "pcm":
      return `audio/pcm;rate=${rate}`;
    case "mulaw":
      return "audio/basic";
    default:
      return "audio/wav";
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
