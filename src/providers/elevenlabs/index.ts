import { z } from "zod";
import { stripAudioTags } from "../../audio-tags.js";
import { base64ToUint8Array } from "../../audio-utils.js";
import { SpeechSDKError } from "../../errors.js";
import {
  handleErrorResponse,
  resolveApiKey,
  SDK_USER_AGENT,
} from "../../provider-utils.js";
import {
  hasFeature,
  type ModelInfo,
  type ResolvedModel,
  type SpeechProvider,
} from "../../speech-provider.js";
import type { ResolvedSTTModel } from "../../speech-to-text-provider.js";
import type { WordTimestamp } from "../../timestamps.js";
import {
  alignmentToWordTimestamps,
  elevenLabsAlignmentSchema,
} from "./alignment.js";

const withTimestampsResponseSchema = z.object({
  audio_base64: z.string().optional(),
  alignment: elevenLabsAlignmentSchema.optional(),
  normalized_alignment: elevenLabsAlignmentSchema.optional(),
});

export interface ElevenLabsSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fallbackSTT?: ResolvedSTTModel;
  fetch?: typeof globalThis.fetch;
}

export const ELEVENLABS_PROVIDER_ID = "elevenlabs" as const;

const ELEVENLABS_V2_LANGUAGES = [
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

const ELEVENLABS_FLASH_V2_5_LANGUAGES = [
  ...ELEVENLABS_V2_LANGUAGES,
  "hu",
  "no",
  "vi",
] as const;

const ELEVENLABS_V3_LANGUAGES = [
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

export const ELEVENLABS_MODELS: readonly ModelInfo[] = [
  {
    id: "eleven_v3",
    releaseDate: "2025-06-08",
    languages: ELEVENLABS_V3_LANGUAGES,
    features: ["streaming", "audio-tags", "timestamps"],
  },
  {
    id: "eleven_multilingual_v2",
    releaseDate: "2023-08-22",
    languages: ELEVENLABS_V2_LANGUAGES,
    features: ["streaming", "timestamps"],
  },
  {
    id: "eleven_flash_v2_5",
    releaseDate: "2024-12-01",
    languages: ELEVENLABS_FLASH_V2_5_LANGUAGES,
    features: ["streaming", "timestamps"],
  },
  {
    id: "eleven_flash_v2",
    releaseDate: "2024-12-01",
    languages: ["en"] as const,
    features: ["streaming", "timestamps"],
  },
] as const;

export class ElevenLabsSpeechProvider
  implements SpeechProvider<string, string>
{
  readonly id = ELEVENLABS_PROVIDER_ID;
  readonly defaultModel = "eleven_multilingual_v2";

  readonly models = ELEVENLABS_MODELS;

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
  ): {
    body: Record<string, unknown>;
    queryString: string;
    outputFormat: string | undefined;
  } {
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
    const outputFormat =
      output_format == null ? undefined : String(output_format);
    if (outputFormat != null) {
      queryParams.set("output_format", outputFormat);
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

    return { body, queryString: queryParams.toString(), outputFormat };
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
    includeTimestamps?: boolean;
  }): Promise<{
    audio: Uint8Array;
    audioDurationMs?: number;
    mediaType: string;
    providerMetadata?: Record<string, unknown>;
    timestamps?: WordTimestamp[];
  }> {
    if (!options.voice) {
      throw new SpeechSDKError(
        "ElevenLabs requires a voice ID. Pass it via the voice option."
      );
    }

    const { body, queryString, outputFormat } = this.buildRequest(
      options.text,
      options.modelId,
      options.providerOptions
    );

    // /with-timestamps returns base64 audio + character-level alignment in JSON; we aggregate characters → words before returning.
    const path = options.includeTimestamps
      ? `/v1/text-to-speech/${options.voice}/with-timestamps`
      : `/v1/text-to-speech/${options.voice}`;
    let url = `${this.baseURL}${path}`;
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
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);

    const requestId = response.headers.get("request-id");
    const durationHeader = response.headers.get("audio-duration-seconds");
    const parsedDuration =
      durationHeader == null ? Number.NaN : Number.parseFloat(durationHeader);
    const headerDurationMs = Number.isFinite(parsedDuration)
      ? Math.round(parsedDuration * 1000)
      : undefined;

    if (options.includeTimestamps) {
      const payload = withTimestampsResponseSchema.parse(await response.json());

      if (!payload.audio_base64) {
        throw new SpeechSDKError(
          `elevenlabs/${options.modelId}: /with-timestamps response missing audio_base64`
        );
      }

      const audio = base64ToUint8Array(payload.audio_base64);
      // normalized_alignment matches what was actually spoken (expanded numbers/abbreviations).
      const alignment =
        payload.normalized_alignment ?? payload.alignment ?? null;
      const timestamps = alignment
        ? alignmentToWordTimestamps(alignment)
        : undefined;

      return {
        audio,
        audioDurationMs: headerDurationMs,
        // No Content-Type for base64-in-JSON audio bytes; derive from output_format.
        mediaType: elevenLabsFormatToMediaType(outputFormat),
        providerMetadata: requestId ? { requestId } : undefined,
        timestamps,
      };
    }

    const arrayBuffer = await response.arrayBuffer();
    const mediaType = response.headers.get("content-type") ?? "audio/mpeg";

    return {
      audio: new Uint8Array(arrayBuffer),
      audioDurationMs: headerDurationMs,
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
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);

    if (!response.body) {
      throw new Error(`elevenlabs/${options.modelId}: response has no body`);
    }

    const requestId = response.headers.get("request-id");
    const durationHeader = response.headers.get("audio-duration-seconds");
    const parsedDuration =
      durationHeader == null ? Number.NaN : Number.parseFloat(durationHeader);
    const audioDurationMs = Number.isFinite(parsedDuration)
      ? Math.round(parsedDuration * 1000)
      : undefined;

    return {
      audioDurationMs,
      stream: response.body,
      mediaType: response.headers.get("content-type") ?? "audio/mpeg",
      providerMetadata: requestId ? { requestId } : undefined,
    };
  }

  getStitchOptions(modelId: string) {
    if (this.models.some((m) => m.id === modelId)) {
      return {
        providerOptions: { output_format: "pcm_24000" },
        mediaType: "audio/pcm;rate=24000",
      };
    }
    return;
  }

  dialogueCapabilities(modelId: string) {
    if (modelId === "eleven_v3") {
      return { minVoices: 1, maxVoices: 10, maxTotalChars: 2000 };
    }
    return;
  }

  async generateDialogue(options: {
    modelId: string;
    turns: readonly { voice: string; text: string }[];
    providerOptions?: Record<string, unknown>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<{
    audio: Uint8Array;
    mediaType: string;
    providerMetadata?: Record<string, unknown>;
  }> {
    if (options.modelId !== "eleven_v3") {
      throw new SpeechSDKError(
        `elevenlabs/${options.modelId} does not support native dialogue; use eleven_v3.`
      );
    }

    const opts = (options.providerOptions ?? {}) as Record<string, unknown>;
    const { output_format, ...bodyOpts } = opts;

    const body: Record<string, unknown> = {
      ...bodyOpts,
      model_id: options.modelId,
      inputs: options.turns.map((t) => ({ text: t.text, voice_id: t.voice })),
    };

    const queryParams = new URLSearchParams();
    if (output_format != null) {
      queryParams.set("output_format", String(output_format));
    }
    const qs = queryParams.toString();
    const url = `${this.baseURL}/v1/text-to-dialogue${qs ? `?${qs}` : ""}`;

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": resolveApiKey(
          this.apiKey,
          "ELEVENLABS_API_KEY",
          "ElevenLabs"
        ),
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);

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
  const fallbackSTT = config.fallbackSTT;

  return function elevenlabs(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
      ...(fallbackSTT && { fallbackSTT }),
    };
  };
}

// Unknown formats fall back to mp3 (the endpoint's default).
function elevenLabsFormatToMediaType(format: string | undefined): string {
  if (!format) {
    return "audio/mpeg";
  }
  if (format.startsWith("mp3_")) {
    return "audio/mpeg";
  }
  if (format.startsWith("pcm_")) {
    const rate = Number.parseInt(format.slice(4), 10);
    return Number.isFinite(rate) && rate > 0
      ? `audio/pcm;rate=${rate}`
      : "audio/pcm";
  }
  if (format.startsWith("ulaw_")) {
    const rate = Number.parseInt(format.slice(5), 10);
    return Number.isFinite(rate) && rate > 0
      ? `audio/basic;rate=${rate}`
      : "audio/basic";
  }
  if (format.startsWith("opus_")) {
    return "audio/opus";
  }
  return "audio/mpeg";
}
