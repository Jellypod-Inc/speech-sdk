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

// Deepgram /v1/speak takes audio-shaping params on the query string; only `text` in body or it returns PAYLOAD_ERROR.
function buildSpeakUrl(
  baseURL: string,
  options: {
    modelId: string;
    voice?: string;
    providerOptions?: Record<string, unknown>;
  }
): string {
  const modelParam = options.voice
    ? `${options.modelId}-${options.voice}`
    : options.modelId;
  const qs = new URLSearchParams({ model: modelParam });
  for (const [k, v] of Object.entries(options.providerOptions ?? {})) {
    if (v == null) {
      continue;
    }
    qs.set(k, typeof v === "string" ? v : String(v));
  }
  return `${baseURL}/speak?${qs.toString()}`;
}

export interface DeepgramSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fallbackSTT?: ResolvedSTTModel;
  fetch?: typeof globalThis.fetch;
}

export const DEEPGRAM_PROVIDER_ID = "deepgram" as const;

export const DEEPGRAM_MODELS: readonly ModelInfo[] = [
  {
    id: "aura-2",
    releaseDate: "2025-04-15",
    languages: ["en", "es", "de", "fr", "it", "ja", "nl"],
    features: ["streaming"],
  },
] as const;

export class DeepgramSpeechProvider implements SpeechProvider<string, string> {
  readonly id = DEEPGRAM_PROVIDER_ID;
  readonly defaultModel = "aura-2";

  readonly models = DEEPGRAM_MODELS;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: DeepgramSpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? "https://api.deepgram.com/v1";
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
    providerMetadata?: Record<string, unknown>;
  }> {
    const url = buildSpeakUrl(this.baseURL, options);

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token ${resolveApiKey(this.apiKey, "DEEPGRAM_API_KEY", "Deepgram")}`,
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify({ text: options.text }),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);

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
    const url = buildSpeakUrl(this.baseURL, options);

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token ${resolveApiKey(this.apiKey, "DEEPGRAM_API_KEY", "Deepgram")}`,
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify({ text: options.text }),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);

    if (!response.body) {
      throw new Error(`deepgram/${options.modelId}: response has no body`);
    }

    return {
      stream: response.body,
      mediaType: response.headers.get("content-type") ?? "audio/mpeg",
    };
  }

  getStitchOptions(modelId: string) {
    if (this.models.some((m) => m.id === modelId)) {
      return {
        providerOptions: {
          encoding: "linear16",
          sample_rate: 24_000,
          container: "wav",
        },
        mediaType: "audio/wav",
      };
    }
    return undefined;
  }
}

export function createDeepgram(config: DeepgramSpeechProviderConfig = {}) {
  const provider = new DeepgramSpeechProvider(config);
  const fallbackSTT = config.fallbackSTT;

  return function deepgram(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
      ...(fallbackSTT && { fallbackSTT }),
    };
  };
}
