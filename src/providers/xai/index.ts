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

// ISO 639-1 codes, matching the rest of the SDK. xAI's API also accepts
// region-qualified BCP-47 codes (e.g. `pt-BR`, `es-MX`) and `auto` for
// detection — callers can pass either via `providerOptions.language`.
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

  // xAI natively supports bracket inline tags (`[pause]`, `[laugh]`) and
  // angle-bracket wrapping tags (`<whisper>...</whisper>`), so we pass text
  // through unchanged.
  processAudioTags(text: string): { text: string; warnings: string[] } {
    return { text, warnings: [] };
  }

  private buildBody(options: {
    text: string;
    voice?: string;
    providerOptions?: Record<string, unknown>;
  }): Record<string, unknown> {
    // `language` is required by xAI. Default to "auto" for language detection;
    // users can override via providerOptions.language with a BCP-47 code.
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

    await handleErrorResponse(response, `xai/${options.modelId}`);

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

    await handleErrorResponse(response, `xai/${options.modelId}`);

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
      // xAI Grok TTS accepts output_format.codec and its mediaTypeForCodec
      // helper maps "wav" → "audio/wav", which the stitch layer can decode.
      return {
        providerOptions: { output_format: { codec: "wav" } },
        mediaType: "audio/wav",
      };
    }
    return undefined;
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
