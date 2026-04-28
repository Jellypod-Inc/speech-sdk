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

export interface XaiSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fallbackSTT?: ResolvedSTTModel;
  fetch?: typeof globalThis.fetch;
}

export const XAI_PROVIDER_ID = "xai" as const;

// ISO 639-1 codes; xAI also accepts BCP-47 (e.g. pt-BR) and "auto" via providerOptions.language.
const XAI_LANGUAGES = [
  "en",
  "ar",
  "bn",
  "zh",
  "fr",
  "de",
  "hi",
  "id",
  "it",
  "ja",
  "ko",
  "pt",
  "ru",
  "es",
  "tr",
  "vi",
] as const;

export const XAI_MODELS: readonly ModelInfo[] = [
  {
    id: "grok-tts",
    releaseDate: "2025-11-01",
    languages: XAI_LANGUAGES,
    features: ["streaming", "audio-tags"],
  },
] as const;

export class XaiSpeechProvider implements SpeechProvider<string, string> {
  readonly id = XAI_PROVIDER_ID;
  readonly defaultModel = "grok-tts";

  readonly models = XAI_MODELS;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: XaiSpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? "https://api.x.ai/v1";
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  // xAI natively supports bracket and angle-bracket audio tags, so passthrough is safe.
  processAudioTags(text: string): { text: string; warnings: string[] } {
    return { text, warnings: [] };
  }

  private buildBody(options: {
    text: string;
    voice?: string;
    providerOptions?: Record<string, unknown>;
  }): Record<string, unknown> {
    // `language` is required by xAI; default to "auto" so detection runs unless caller overrides.
    const body: Record<string, unknown> = {
      language: "auto",
      ...options.providerOptions,
      text: options.text,
    };
    if (options.voice != null) {
      body.voice_id = options.voice;
    }
    return body;
  }

  private mediaTypeForCodec(codec: unknown): string {
    if (codec === "wav") {
      return "audio/wav";
    }
    if (codec === "pcm") {
      return "audio/pcm";
    }
    if (codec === "mulaw") {
      return "audio/basic";
    }
    if (codec === "alaw") {
      return "audio/alaw";
    }
    return "audio/mpeg";
  }

  private codecFromBody(body: Record<string, unknown>): unknown {
    const output = body.output_format as { codec?: unknown } | undefined;
    return output?.codec;
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
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);

    const arrayBuffer = await response.arrayBuffer();
    const mediaType =
      response.headers.get("content-type") ??
      this.mediaTypeForCodec(this.codecFromBody(body));

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
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);

    if (!response.body) {
      throw new Error(`xai/${options.modelId}: response has no body`);
    }

    return {
      stream: response.body,
      mediaType:
        response.headers.get("content-type") ??
        this.mediaTypeForCodec(this.codecFromBody(body)),
    };
  }

  getStitchOptions(modelId: string) {
    if (this.models.some((m) => m.id === modelId)) {
      return {
        providerOptions: { output_format: { codec: "wav" } },
        mediaType: "audio/wav",
      };
    }
    return;
  }

  resolveOutputFormat(
    modelId: string,
    output: import("../../audio-output.js").AudioOutput
  ) {
    if (!this.models.some((m) => m.id === modelId)) {
      return;
    }
    switch (output.format) {
      case "wav":
        return {
          providerOptions: { output_format: { codec: "wav" } },
          expectedMediaType: "audio/wav",
        };
      case "mp3":
        return {
          providerOptions: { output_format: { codec: "mp3" } },
          expectedMediaType: "audio/mpeg",
        };
      case "pcm":
        return {
          providerOptions: {
            output_format: { codec: "pcm", sample_rate: 24_000 },
          },
          expectedMediaType: "audio/pcm;rate=24000",
        };
      default:
        return;
    }
  }
}

export function createXai(config: XaiSpeechProviderConfig = {}) {
  const provider = new XaiSpeechProvider(config);
  const fallbackSTT = config.fallbackSTT;
  return function xai(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
      ...(fallbackSTT && { fallbackSTT }),
    };
  };
}
