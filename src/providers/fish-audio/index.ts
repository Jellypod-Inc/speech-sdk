import { stripAudioTags } from "../../audio-tags.js";
import { handleErrorResponse, resolveApiKey } from "../../provider-utils.js";
import {
  hasFeature,
  type ResolvedModel,
  type SpeechProvider,
} from "../../speech-provider.js";

export interface FishAudioSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
}

export class FishAudioSpeechProvider implements SpeechProvider<string, string> {
  readonly id = "fish-audio";
  readonly defaultModel = "s2-pro";

  readonly models = [
    {
      id: "s2-pro",
      releaseDate: "2026-03-09",
      languages: ["ja", "en", "zh", "ko", "es", "pt", "ar", "ru", "fr", "de"],
      features: [
        "streaming",
        "audio-tags",
        "open-source",
        "inline-voice-cloning",
      ],
    },
  ] as const;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: FishAudioSpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? "https://api.fish.audio";
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  processAudioTags(
    text: string,
    modelId: string
  ): { text: string; warnings: string[] } {
    if (
      this.models.some((m) => m.id === modelId && hasFeature(m, "audio-tags"))
    ) {
      return { text, warnings: [] };
    }
    return stripAudioTags(text, `fish-audio/${modelId}`);
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
    const url = `${this.baseURL}/v1/tts`;

    const body: Record<string, unknown> = {
      ...options.providerOptions,
      text: options.text,
    };

    if (options.voice) {
      body.reference_id = options.voice;
    }

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolveApiKey(this.apiKey, "FISH_AUDIO_API_KEY", "Fish Audio")}`,
        model: options.modelId,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `fish-audio/${options.modelId}`);

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
    const url = `${this.baseURL}/v1/tts`;

    const body: Record<string, unknown> = {
      ...options.providerOptions,
      text: options.text,
    };
    if (options.voice) {
      body.reference_id = options.voice;
    }

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolveApiKey(this.apiKey, "FISH_AUDIO_API_KEY", "Fish Audio")}`,
        model: options.modelId,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `fish-audio/${options.modelId}`);

    if (!response.body) {
      throw new Error(`fish-audio/${options.modelId}: response has no body`);
    }

    return {
      stream: response.body,
      mediaType: response.headers.get("content-type") ?? "audio/mpeg",
    };
  }

  getStitchOptions(modelId: string) {
    if (this.models.some((m) => m.id === modelId)) {
      return {
        providerOptions: { format: "wav" },
        mediaType: "audio/wav",
      };
    }
    return undefined;
  }
}

export function createFishAudio(config: FishAudioSpeechProviderConfig = {}) {
  const provider = new FishAudioSpeechProvider(config);

  return function fishAudio(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
    };
  };
}
