import { stripAudioTags } from "../../audio-tags.js";
import { SpeechSDKError } from "../../errors.js";
import { handleErrorResponse, resolveApiKey } from "../../provider-utils.js";
import type { ResolvedModel, SpeechProvider } from "../../speech-provider.js";

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
      audioTags: true,
      languages: ElevenLabsSpeechProvider.V3_LANGUAGES,
      releaseDate: "2025-06-08",
      openSource: false,
      inlineVoiceCloning: false,
      zeroDataRetention: true,
    },
    {
      id: "eleven_multilingual_v2",
      audioTags: false,
      languages: ElevenLabsSpeechProvider.V2_LANGUAGES,
      releaseDate: "2023-08-22",
      openSource: false,
      inlineVoiceCloning: false,
      zeroDataRetention: true,
    },
    {
      id: "eleven_flash_v2_5",
      audioTags: false,
      languages: ElevenLabsSpeechProvider.FLASH_V2_5_LANGUAGES,
      releaseDate: "2024-12-01",
      openSource: false,
      inlineVoiceCloning: false,
      zeroDataRetention: true,
    },
    {
      id: "eleven_flash_v2",
      audioTags: false,
      languages: ["en"] as const,
      releaseDate: "2024-12-01",
      openSource: false,
      inlineVoiceCloning: false,
      zeroDataRetention: true,
    },
  ] as const;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: ElevenLabsSpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? "https://api.elevenlabs.io";
    this.fetchFn = config.fetch ?? globalThis.fetch;
  }

  processAudioTags(
    text: string,
    modelId: string
  ): { text: string; warnings: string[] } {
    if (this.models.some((m) => m.id === modelId && m.audioTags)) {
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
    mediaType: string;
    providerMetadata?: Record<string, unknown>;
  }> {
    if (!options.voice) {
      throw new SpeechSDKError(
        "ElevenLabs requires a voice ID. Pass it via the voice option."
      );
    }

    const providerOptions = options.providerOptions ?? {};
    const {
      output_format,
      enable_logging,
      optimize_streaming_latency,
      ...bodyOptions
    } = providerOptions as Record<string, unknown>;

    const body: Record<string, unknown> = {
      ...bodyOptions,
      text: options.text,
      model_id: options.modelId,
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

    let url = `${this.baseURL}/v1/text-to-speech/${options.voice}`;
    const queryString = queryParams.toString();
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

    return {
      audio: new Uint8Array(arrayBuffer),
      mediaType,
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
