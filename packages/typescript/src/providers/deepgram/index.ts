import { handleErrorResponse, resolveApiKey } from "../../provider-utils.js";
import type { ResolvedModel, SpeechProvider } from "../../speech-provider.js";

export interface DeepgramSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
}

export class DeepgramSpeechProvider implements SpeechProvider<string, string> {
  readonly id = "deepgram";
  readonly defaultModel = "aura-2";

  readonly models = [
    {
      id: "aura-2",
      audioTags: false,
      languages: ["en", "es", "de", "fr", "it", "ja", "nl"],
      releaseDate: "2025-04-15",
      openSource: false,
      inlineVoiceCloning: false,
    },
  ] as const;

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
    const modelParam = options.voice
      ? `${options.modelId}-${options.voice}`
      : options.modelId;

    const url = `${this.baseURL}/speak?model=${encodeURIComponent(modelParam)}`;

    const body: Record<string, unknown> = {
      ...options.providerOptions,
      text: options.text,
    };

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token ${resolveApiKey(this.apiKey, "DEEPGRAM_API_KEY", "Deepgram")}`,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `deepgram/${options.modelId}`);

    const arrayBuffer = await response.arrayBuffer();
    const mediaType = response.headers.get("content-type") ?? "audio/mpeg";

    return {
      audio: new Uint8Array(arrayBuffer),
      mediaType,
    };
  }
}

export function createDeepgram(config: DeepgramSpeechProviderConfig = {}) {
  const provider = new DeepgramSpeechProvider(config);

  return function deepgram(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
    };
  };
}
