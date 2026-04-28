import { z } from "zod";
import type { AudioOutput, AudioOutputFormat } from "../../audio-output.js";
import { ApiError, StreamingNotSupportedError } from "../../errors.js";
import {
  handleErrorResponse,
  resolveApiKey,
  SDK_USER_AGENT,
} from "../../provider-utils.js";
import type {
  ModelInfo,
  ResolvedModel,
  ResolvedOutputFormat,
  SpeechProvider,
} from "../../speech-provider.js";
import type { ResolvedSTTModel } from "../../speech-to-text-provider.js";

const falJobResponseSchema = z.object({
  audio: z.object({
    url: z.string(),
    content_type: z.string().optional(),
  }),
});

export interface FalSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fallbackSTT?: ResolvedSTTModel;
  fetch?: typeof globalThis.fetch;
}

export const FAL_PROVIDER_ID = "fal-ai" as const;

const FAL_NATIVE_FORMATS: Record<
  string,
  { format: AudioOutputFormat; mediaType: string }
> = {
  "f5-tts": { format: "wav", mediaType: "audio/wav" },
  kokoro: { format: "wav", mediaType: "audio/wav" },
  "orpheus-tts": { format: "wav", mediaType: "audio/wav" },
};

export const FAL_MODELS: readonly ModelInfo[] = [
  {
    id: "f5-tts",
    releaseDate: "2024-10-08",
    languages: ["en", "zh", "fr", "it", "hi", "ja", "ru", "es", "fi"],
    features: ["open-source", "inline-voice-cloning"],
  },
  {
    id: "kokoro",
    releaseDate: "2025-01-27",
    languages: ["en", "fr", "ko", "ja", "zh"],
    features: ["open-source"],
  },
  {
    id: "orpheus-tts",
    releaseDate: "2025-03-18",
    languages: ["en", "es", "fr", "de", "it", "pt", "zh"],
    features: ["open-source"],
  },
] as const;

export class FalSpeechProvider
  implements SpeechProvider<string, string | { url: string }>
{
  readonly id = FAL_PROVIDER_ID;
  readonly defaultModel = "";

  readonly models = FAL_MODELS;

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
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);

    const json = falJobResponseSchema.parse(await response.json());
    return await this.fetchAudio(json, options);
  }

  private async fetchAudio(
    json: z.infer<typeof falJobResponseSchema>,
    options: { abortSignal?: AbortSignal }
  ): Promise<{ audio: Uint8Array; mediaType: string }> {
    const audioResponse = await this.fetchFn(json.audio.url, {
      signal: options.abortSignal,
    });

    if (!audioResponse.ok) {
      throw new ApiError(`API error: ${audioResponse.status}`, {
        statusCode: audioResponse.status,
        responseBody: await audioResponse.text().catch(() => undefined),
      });
    }

    const arrayBuffer = await audioResponse.arrayBuffer();
    // Authoritative content_type lives in fal's JSON; CDN header and audio/wav are fallbacks.
    const mediaType =
      json.audio.content_type ??
      audioResponse.headers.get("content-type") ??
      "audio/wav";

    return { audio: new Uint8Array(arrayBuffer), mediaType };
  }

  stream(options: { modelId: string }): Promise<never> {
    return Promise.reject(
      new StreamingNotSupportedError(`fal-ai/${options.modelId}`)
    );
  }

  getStitchOptions(modelId: string) {
    // fal exposes no format selector — listed models all return WAV.
    if (this.models.some((m) => m.id === modelId)) {
      return {
        providerOptions: {},
        mediaType: "audio/wav",
      };
    }
    return;
  }

  resolveOutputFormat(
    modelId: string,
    output: AudioOutput
  ): ResolvedOutputFormat | undefined {
    const model = this.models.find((m) => m.id === modelId);
    if (!model) {
      return;
    }
    const native = FAL_NATIVE_FORMATS[modelId];
    if (!native) {
      return;
    }
    if (output.format === native.format) {
      return { providerOptions: {}, expectedMediaType: native.mediaType };
    }
    return;
  }
}

export function createFal(config: FalSpeechProviderConfig = {}) {
  const provider = new FalSpeechProvider(config);
  const fallbackSTT = config.fallbackSTT;

  return function fal(
    modelId?: string
  ): ResolvedModel<string | { url: string }> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
      ...(fallbackSTT && { fallbackSTT }),
    };
  };
}
