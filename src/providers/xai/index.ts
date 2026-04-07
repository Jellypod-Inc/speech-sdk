import { handleErrorResponse, resolveApiKey } from "../../provider-utils.js";
import type { ResolvedModel, SpeechProvider } from "../../speech-provider.js";

export interface XaiSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
}

export class XaiSpeechProvider implements SpeechProvider<string, string> {
  readonly id = "xai";
  readonly defaultModel = "grok-tts";

  private static readonly LANGUAGES = [
    "en",
    "es",
    "fr",
    "de",
    "it",
    "pt",
    "nl",
    "pl",
    "ru",
    "tr",
    "ar",
    "hi",
    "ja",
    "ko",
    "zh",
    "id",
    "vi",
    "th",
    "sv",
    "da",
  ] as const;

  readonly models = [
    {
      id: "grok-tts",
      releaseDate: "2025-11-01",
      languages: XaiSpeechProvider.LANGUAGES,
      features: ["streaming", "audio-tags"],
    },
  ] as const;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: XaiSpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? "https://api.x.ai/v1";
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private buildBody(options: {
    text: string;
    voice?: string;
    providerOptions?: Record<string, unknown>;
  }): Record<string, unknown> {
    const body: Record<string, unknown> = {
      language: "en",
      codec: "mp3",
      ...options.providerOptions,
      text: options.text,
    };
    if (options.voice != null) {
      body.voice_id = options.voice;
    }
    return body;
  }

  private mediaTypeForCodec(codec: unknown): string {
    if (codec === "wav" || codec === "pcm") {
      return "audio/wav";
    }
    if (codec === "mulaw" || codec === "alaw") {
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
    const body = this.buildBody(options);
    const response = await this.fetchFn(`${this.baseURL}/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolveApiKey(this.apiKey, "XAI_API_KEY", "xAI")}`,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `xai/${options.modelId}`);

    const arrayBuffer = await response.arrayBuffer();
    const mediaType =
      response.headers.get("content-type") ??
      this.mediaTypeForCodec(body.codec);

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
  }> {
    const body = this.buildBody(options);
    const response = await this.fetchFn(`${this.baseURL}/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolveApiKey(this.apiKey, "XAI_API_KEY", "xAI")}`,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `xai/${options.modelId}`);

    if (!response.body) {
      throw new Error(`xai/${options.modelId}: response has no body`);
    }

    return {
      stream: response.body,
      mediaType:
        response.headers.get("content-type") ??
        this.mediaTypeForCodec(body.codec),
    };
  }
}

export function createXai(config: XaiSpeechProviderConfig = {}) {
  const provider = new XaiSpeechProvider(config);
  return function xai(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
    };
  };
}
