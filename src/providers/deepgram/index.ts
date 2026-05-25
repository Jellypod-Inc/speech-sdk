import type { AudioOutput } from "../../audio-output.js";
import {
  handleErrorResponse,
  resolveApiKey,
  SDK_USER_AGENT,
} from "../../provider-utils.js";
import {
  type ModelInfo,
  type ResolvedModel,
  resolveSampleRate,
  type SpeechProvider,
} from "../../speech-provider.js";
import type { ResolvedSTTModel } from "../../speech-to-text-provider.js";

const DEEPGRAM_AURA_RATES = [8000, 16_000, 24_000, 32_000, 48_000] as const;

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
    maxInputChars: 2000,
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
    const mediaType = deepgramMediaTypeFromProviderOptions(
      options.providerOptions,
      response.headers.get("content-type")
    );

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
      mediaType: deepgramMediaTypeFromProviderOptions(
        options.providerOptions,
        response.headers.get("content-type")
      ),
    };
  }

  supportedSampleRates(modelId: string): readonly number[] {
    if (!this.models.some((m) => m.id === modelId)) {
      return [];
    }
    return DEEPGRAM_AURA_RATES;
  }

  getStitchOptions(modelId: string, opts?: { sampleRate?: number }) {
    if (!this.models.some((m) => m.id === modelId)) {
      return;
    }
    const rate = resolveSampleRate(
      `deepgram/${modelId}`,
      this.supportedSampleRates(modelId),
      opts?.sampleRate
    );
    return {
      providerOptions: {
        encoding: "linear16",
        sample_rate: rate,
        container: "wav",
      },
      mediaType: "audio/wav",
    };
  }

  resolveOutputFormat(modelId: string, output: AudioOutput) {
    if (!this.models.some((m) => m.id === modelId)) {
      return;
    }
    switch (output.format) {
      case "wav":
      case "pcm": {
        // Deepgram with container=none returns raw PCM under an audio/l16
        // Content-Type; request container=wav so the SDK gets a decodable WAV.
        const rate = resolveSampleRate(
          `deepgram/${modelId}`,
          this.supportedSampleRates(modelId),
          output.sampleRate
        );
        return {
          providerOptions: {
            encoding: "linear16",
            container: "wav",
            sample_rate: rate,
          },
          expectedMediaType: "audio/wav",
        };
      }
      case "mp3":
        return {
          providerOptions: { encoding: "mp3" },
          expectedMediaType: "audio/mpeg",
        };
      default:
        return;
    }
  }
}

// Deepgram returns raw PCM under an `audio/l16` Content-Type for encoding=linear16 without container=wav. Deepgram documents linear16 as little-endian, but the `audio/l16` label (RFC 2586) implies big-endian, so the byte order is ambiguous and the SDK does not decode it — callers must opt in to container=wav for linear16. mp3/opus/aac/flac are self-describing via Content-Type.
function deepgramMediaTypeFromProviderOptions(
  providerOptions: Record<string, unknown> | undefined,
  contentType: string | null
): string {
  const encoding = providerOptions?.encoding;
  const container = providerOptions?.container;
  const sampleRate = providerOptions?.sample_rate;

  if (encoding === "linear16" && container === "wav") {
    return "audio/wav";
  }
  if (encoding === "linear16") {
    const rate = typeof sampleRate === "number" ? sampleRate : null;
    if (rate == null) {
      throw new Error(
        "deepgram: encoding=linear16 without container=wav returns raw PCM under an audio/l16 Content-Type, which the SDK does not decode (ambiguous byte order). Pass container=wav, or use encoding=mp3."
      );
    }
    return `audio/l16;rate=${rate}`;
  }
  if (encoding === "mp3") {
    return "audio/mpeg";
  }
  return contentType ?? "audio/mpeg";
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
