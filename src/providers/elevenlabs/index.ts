import { stripAudioTags } from "../../audio-tags.js";
import { SpeechSDKError } from "../../errors.js";
import { handleErrorResponse, resolveApiKey } from "../../provider-utils.js";
import {
  hasFeature,
  type ResolvedModel,
  type SpeechProvider,
} from "../../speech-provider.js";

export interface ElevenLabsSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
}

export class ElevenLabsSpeechProvider
  implements SpeechProvider<string, string>
{
  readonly id = "elevenlabs";
  readonly defaultModel = "eleven_multilingual_v2";

  private static readonly V2_LANGUAGES = [
    "ar",
    "bg",
    "cs",
    "da",
    "de",
    "el",
    "en",
    "es",
    "fi",
    "fil",
    "fr",
    "he",
    "hi",
    "hr",
    "id",
    "it",
    "ja",
    "ko",
    "ms",
    "nl",
    "pl",
    "pt",
    "ro",
    "ru",
    "sk",
    "sv",
    "ta",
    "uk",
    "zh",
  ] as const;

  private static readonly FLASH_V2_5_LANGUAGES = [
    ...ElevenLabsSpeechProvider.V2_LANGUAGES,
    "hu",
    "no",
    "vi",
  ] as const;

  private static readonly V3_LANGUAGES = [
    "af",
    "ar",
    "hy",
    "as",
    "az",
    "be",
    "bn",
    "bs",
    "bg",
    "ca",
    "ceb",
    "ny",
    "hr",
    "cs",
    "da",
    "nl",
    "en",
    "et",
    "fil",
    "fi",
    "fr",
    "gl",
    "ka",
    "de",
    "el",
    "gu",
    "ha",
    "he",
    "hi",
    "hu",
    "is",
    "id",
    "ga",
    "it",
    "ja",
    "jv",
    "kn",
    "kk",
    "ky",
    "ko",
    "lv",
    "ln",
    "lt",
    "lb",
    "mk",
    "ms",
    "ml",
    "zh",
    "mr",
    "ne",
    "no",
    "ps",
    "fa",
    "pl",
    "pt",
    "pa",
    "ro",
    "ru",
    "sr",
    "sd",
    "sk",
    "sl",
    "so",
    "es",
    "sw",
    "sv",
    "ta",
    "te",
    "th",
    "tr",
    "uk",
    "ur",
    "vi",
    "cy",
  ] as const;

  readonly models = [
    {
      id: "eleven_v3",
      releaseDate: "2025-06-08",
      languages: ElevenLabsSpeechProvider.V3_LANGUAGES,
      features: ["streaming", "audio-tags"],
    },
    {
      id: "eleven_multilingual_v2",
      releaseDate: "2023-08-22",
      languages: ElevenLabsSpeechProvider.V2_LANGUAGES,
      features: ["streaming"],
    },
    {
      id: "eleven_flash_v2_5",
      releaseDate: "2024-12-01",
      languages: ElevenLabsSpeechProvider.FLASH_V2_5_LANGUAGES,
      features: ["streaming"],
    },
    {
      id: "eleven_flash_v2",
      releaseDate: "2024-12-01",
      languages: ["en"] as const,
      features: ["streaming"],
    },
  ] as const;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: ElevenLabsSpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? "https://api.elevenlabs.io";
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private buildRequest(
    text: string,
    modelId: string,
    providerOptions: Record<string, unknown> | undefined
  ): { body: Record<string, unknown>; queryString: string } {
    const opts = providerOptions ?? {};
    const {
      output_format,
      enable_logging,
      optimize_streaming_latency,
      ...bodyOptions
    } = opts as Record<string, unknown>;

    const body: Record<string, unknown> = {
      ...bodyOptions,
      text,
      model_id: modelId,
    };

    const queryParams = new URLSearchParams();
    if (output_format != null) {
      queryParams.set("output_format", String(output_format));
    }
    if (enable_logging != null) {
      queryParams.set("enable_logging", String(enable_logging));
    }
    if (optimize_streaming_latency != null) {
      queryParams.set(
        "optimize_streaming_latency",
        String(optimize_streaming_latency)
      );
    }

    return { body, queryString: queryParams.toString() };
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
    return stripAudioTags(text, `elevenlabs/${modelId}`);
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
    audioDurationMs?: number;
    mediaType: string;
    providerMetadata?: Record<string, unknown>;
  }> {
    if (!options.voice) {
      throw new SpeechSDKError(
        "ElevenLabs requires a voice ID. Pass it via the voice option."
      );
    }

    const { body, queryString } = this.buildRequest(
      options.text,
      options.modelId,
      options.providerOptions
    );

    let url = `${this.baseURL}/v1/text-to-speech/${options.voice}`;
    if (queryString) {
      url += `?${queryString}`;
    }

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": resolveApiKey(
          this.apiKey,
          "ELEVENLABS_API_KEY",
          "ElevenLabs"
        ),
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `elevenlabs/${options.modelId}`);

    const arrayBuffer = await response.arrayBuffer();
    const mediaType = response.headers.get("content-type") ?? "audio/mpeg";
    const requestId = response.headers.get("request-id");
    const durationHeader = response.headers.get("audio-duration-seconds");
    const audioDurationMs =
      durationHeader == null
        ? undefined
        : Math.round(Number.parseFloat(durationHeader) * 1000);

    return {
      audio: new Uint8Array(arrayBuffer),
      audioDurationMs,
      mediaType,
      providerMetadata: requestId ? { requestId } : undefined,
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
    audioDurationMs?: number;
    stream: ReadableStream<Uint8Array>;
    mediaType: string;
    providerMetadata?: Record<string, unknown>;
  }> {
    if (!options.voice) {
      throw new SpeechSDKError(
        "ElevenLabs requires a voice ID. Pass it via the voice option."
      );
    }

    const { body, queryString } = this.buildRequest(
      options.text,
      options.modelId,
      options.providerOptions
    );

    let url = `${this.baseURL}/v1/text-to-speech/${options.voice}/stream`;
    if (queryString) {
      url += `?${queryString}`;
    }

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": resolveApiKey(
          this.apiKey,
          "ELEVENLABS_API_KEY",
          "ElevenLabs"
        ),
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `elevenlabs/${options.modelId}`);

    if (!response.body) {
      throw new Error(`elevenlabs/${options.modelId}: response has no body`);
    }

    const requestId = response.headers.get("request-id");
    const durationHeader = response.headers.get("audio-duration-seconds");
    const audioDurationMs =
      durationHeader == null
        ? undefined
        : Math.round(Number.parseFloat(durationHeader) * 1000);

    return {
      audioDurationMs,
      stream: response.body,
      mediaType: response.headers.get("content-type") ?? "audio/mpeg",
      providerMetadata: requestId ? { requestId } : undefined,
    };
  }
}

export function createElevenLabs(config: ElevenLabsSpeechProviderConfig = {}) {
  const provider = new ElevenLabsSpeechProvider(config);

  return function elevenlabs(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
    };
  };
}
