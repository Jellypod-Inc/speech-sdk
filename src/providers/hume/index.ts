import { handleErrorResponse, resolveApiKey } from "../../provider-utils.js";
import type { ResolvedModel, SpeechProvider } from "../../speech-provider.js";

export interface HumeSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
}

export class HumeSpeechProvider implements SpeechProvider<string, string> {
  readonly id = "hume";
  readonly defaultModel = "octave-2";

  readonly models = [
    {
      id: "octave-2",
      releaseDate: "2025-10-01",
      languages: [
        "en",
        "fr",
        "de",
        "es",
        "pt",
        "ja",
        "ko",
        "hi",
        "it",
        "ar",
        "ru",
      ] as const,
      features: ["streaming", "inline-voice-cloning"],
    },
    {
      id: "octave-1",
      releaseDate: "2025-03-01",
      languages: ["en"] as const,
      features: ["streaming"],
    },
  ] as const;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: HumeSpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? "https://api.hume.ai/v0";
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private resolveVersion(modelId: string): string | undefined {
    if (modelId === "octave-2") {
      return "2";
    }
    if (modelId === "octave-1") {
      return "1";
    }
    return undefined;
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
    providerMetadata?: Record<string, unknown>;
  }> {
    const utterance: Record<string, unknown> = { text: options.text };
    if (options.voice) {
      utterance.voice = { name: options.voice, provider: "HUME_AI" };
    }

    const version = this.resolveVersion(options.modelId);

    const body: Record<string, unknown> = {
      ...options.providerOptions,
      utterances: [utterance],
    };

    if (version != null) {
      body.version = version;
    }

    const url = `${this.baseURL}/tts/file`;

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hume-Api-Key": resolveApiKey(this.apiKey, "HUME_API_KEY", "Hume"),
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `hume/${options.modelId}`);

    const arrayBuffer = await response.arrayBuffer();
    const mediaType = response.headers.get("content-type") ?? "audio/mpeg";

    return {
      audio: new Uint8Array(arrayBuffer),
      mediaType,
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
    const utterance: Record<string, unknown> = { text: options.text };
    if (options.voice) {
      utterance.voice = { name: options.voice, provider: "HUME_AI" };
    }

    const version = this.resolveVersion(options.modelId);

    const body: Record<string, unknown> = {
      ...options.providerOptions,
      utterances: [utterance],
    };
    if (version != null) {
      body.version = version;
    }

    const url = `${this.baseURL}/tts/stream/file`;

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hume-Api-Key": resolveApiKey(this.apiKey, "HUME_API_KEY", "Hume"),
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `hume/${options.modelId}`);

    if (!response.body) {
      throw new Error(`hume/${options.modelId}: response has no body`);
    }

    return {
      stream: response.body,
      mediaType: response.headers.get("content-type") ?? "audio/mpeg",
    };
  }

  getStitchOptions(modelId: string) {
    if (this.models.some((m) => m.id === modelId)) {
      return {
        providerOptions: { format: { type: "pcm", sample_rate: 24_000 } },
        mediaType: "audio/pcm;rate=24000",
      };
    }
    return undefined;
  }
}

export function createHume(config: HumeSpeechProviderConfig = {}) {
  const provider = new HumeSpeechProvider(config);

  return function hume(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
    };
  };
}
