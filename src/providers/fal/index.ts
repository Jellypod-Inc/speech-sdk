import { ApiError, StreamingNotSupportedError } from "../../errors.js";
import { handleErrorResponse, resolveApiKey } from "../../provider-utils.js";
import type { ResolvedModel, SpeechProvider } from "../../speech-provider.js";

export interface FalSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
}

export class FalSpeechProvider
  implements SpeechProvider<string, string | { url: string }>
{
  readonly id = "fal-ai";
  readonly defaultModel = "";

  readonly models = [
    {
      id: "f5-tts",
      audioTags: false,
      languages: ["en", "zh", "fr", "it", "hi", "ja", "ru", "es", "fi"],
      releaseDate: "2024-10-08",
      openSource: true,
      inlineVoiceCloning: true,
      streaming: false,
    },
    {
      id: "kokoro",
      audioTags: false,
      languages: ["en", "fr", "ko", "ja", "zh"],
      releaseDate: "2025-01-27",
      openSource: true,
      inlineVoiceCloning: false,
      streaming: false,
    },
    {
      id: "dia-tts",
      audioTags: false,
      languages: ["en"],
      releaseDate: "2025-04-21",
      openSource: true,
      inlineVoiceCloning: true,
      streaming: false,
    },
    {
      id: "orpheus-tts",
      audioTags: false,
      languages: ["en", "es", "fr", "de", "it", "pt", "zh"],
      releaseDate: "2025-03-18",
      openSource: true,
      inlineVoiceCloning: false,
      streaming: false,
    },
    {
      id: "index-tts-2",
      audioTags: false,
      languages: ["en", "zh"],
      releaseDate: "2025-09-08",
      openSource: true,
      inlineVoiceCloning: true,
      streaming: false,
    },
  ] as const;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: FalSpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? "https://fal.run";
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async generate(options: {
    modelId: string;
    text: string;
    voice?: string | { url: string };
    providerOptions?: Record<string, unknown>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<{
    audio: Uint8Array;
    mediaType: string;
    providerMetadata?: Record<string, unknown>;
  }> {
    if (!options.modelId) {
      throw new Error(
        'fal-ai requires a model ID (e.g., "fal-ai/inworld-tts"). No default model is available.'
      );
    }

    const url = `${this.baseURL}/fal-ai/${options.modelId}`;

    const body: Record<string, unknown> = {
      ...options.providerOptions,
      text: options.text,
    };

    if (options.voice != null) {
      if (typeof options.voice === "string") {
        body.voice = options.voice;
      } else if ("url" in options.voice) {
        body.audio_url = options.voice.url;
      }
    }

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${resolveApiKey(this.apiKey, "FAL_API_KEY", "fal")}`,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `fal-ai/${options.modelId}`);

    const json = (await response.json()) as { audio: { url: string } };

    const audioResponse = await this.fetchFn(json.audio.url, {
      signal: options.abortSignal,
    });

    if (!audioResponse.ok) {
      throw new ApiError(`API error: ${audioResponse.status}`, {
        statusCode: audioResponse.status,
        model: `fal-ai/${options.modelId}`,
        responseBody: await audioResponse.text().catch(() => undefined),
      });
    }

    const arrayBuffer = await audioResponse.arrayBuffer();

    return {
      audio: new Uint8Array(arrayBuffer),
      mediaType: "audio/mpeg",
    };
  }

  stream(options: { modelId: string }): Promise<never> {
    return Promise.reject(
      new StreamingNotSupportedError(`fal-ai/${options.modelId}`)
    );
  }
}

export function createFal(config: FalSpeechProviderConfig = {}) {
  const provider = new FalSpeechProvider(config);

  return function fal(
    modelId?: string
  ): ResolvedModel<string | { url: string }> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
    };
  };
}
