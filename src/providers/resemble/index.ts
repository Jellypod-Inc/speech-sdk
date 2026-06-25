import { z } from "zod";
import type { AudioOutput } from "../../audio-output.js";
import { SpeechSDKError } from "../../errors.js";
import {
  handleErrorResponse,
  resolveApiKey,
  SDK_USER_AGENT,
} from "../../provider-utils.js";
import {
  type DesignVoiceProviderRequest,
  type DesignVoiceProviderResult,
  type ModelInfo,
  type ResolvedModel,
  resolveSampleRate,
  type SpeechProvider,
} from "../../speech-provider.js";
import type { ResolvedSTTModel } from "../../speech-to-text-provider.js";
import type { WordTimestamp } from "../../timestamps.js";
import {
  audioTimestampsToWordTimestamps,
  resembleAudioTimestampsSchema,
} from "./alignment.js";

const synthesizeResponseSchema = z.object({
  audio_content: z.string(),
  audio_timestamps: resembleAudioTimestampsSchema.optional(),
});

export interface ResembleSpeechProviderConfig {
  apiKey?: string;
  /** Public REST API base, used for voice design. Defaults to https://app.resemble.ai/api/v2. */
  appBaseURL?: string;
  baseURL?: string;
  fallbackSTT?: ResolvedSTTModel;
  fetch?: typeof globalThis.fetch;
}

export const RESEMBLE_PROVIDER_ID = "resemble" as const;

// Resemble /synthesize accepts sample_rate as a string enum (docs.resemble.ai).
const RESEMBLE_SAMPLE_RATES = [
  8000, 16_000, 22_050, 32_000, 44_100, 48_000,
] as const;

export const RESEMBLE_MODELS: readonly ModelInfo[] = [
  {
    id: "default",
    releaseDate: "2025-09-04",
    languages: [
      "en",
      "ar",
      "da",
      "de",
      "el",
      "es",
      "fi",
      "fr",
      "he",
      "hi",
      "it",
      "ja",
      "ko",
      "ms",
      "nl",
      "no",
      "pl",
      "pt",
      "ru",
      "sv",
      "sw",
      "tr",
      "zh",
    ],
    features: ["streaming", "open-source", "timestamps", "voice-design"],
  },
] as const;

export class ResembleSpeechProvider implements SpeechProvider<string, string> {
  readonly id = RESEMBLE_PROVIDER_ID;
  readonly defaultModel = "default";

  readonly models = RESEMBLE_MODELS;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly appBaseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: ResembleSpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? "https://f.cluster.resemble.ai";
    this.appBaseURL = config.appBaseURL ?? "https://app.resemble.ai/api/v2";
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
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
    audio: string;
    mediaType: string;
    providerMetadata?: Record<string, unknown>;
    timestamps?: WordTimestamp[];
  }> {
    const url = `${this.baseURL}/synthesize`;

    const body: Record<string, unknown> = {
      ...options.providerOptions,
      voice_uuid: options.voice,
      data: options.text,
    };

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: resolveApiKey(
          this.apiKey,
          "RESEMBLE_API_KEY",
          "Resemble"
        ),
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);

    // Gate timestamp projection on caller opt-in, not the always-present audio_timestamps field.
    const json = synthesizeResponseSchema.parse(await response.json());

    const timestamps =
      options.includeTimestamps && json.audio_timestamps
        ? audioTimestampsToWordTimestamps(json.audio_timestamps)
        : undefined;

    return {
      audio: json.audio_content,
      mediaType: resembleMediaType(body.output_format),
      timestamps,
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
    const url = `${this.baseURL}/stream`;

    const body: Record<string, unknown> = {
      ...options.providerOptions,
      voice_uuid: options.voice,
      data: options.text,
    };

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: resolveApiKey(
          this.apiKey,
          "RESEMBLE_API_KEY",
          "Resemble"
        ),
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);

    if (!response.body) {
      throw new Error(`resemble/${options.modelId}: response has no body`);
    }

    return {
      stream: response.body,
      mediaType: response.headers.get("content-type") ?? "audio/wav",
    };
  }

  supportedSampleRates(modelId: string): readonly number[] {
    if (!this.models.some((m) => m.id === modelId)) {
      return [];
    }
    return RESEMBLE_SAMPLE_RATES;
  }

  getStitchOptions(modelId: string, opts?: { sampleRate?: number }) {
    if (!this.models.some((m) => m.id === modelId)) {
      return;
    }
    const rate = resolveSampleRate(
      `resemble/${modelId}`,
      this.supportedSampleRates(modelId),
      opts?.sampleRate
    );
    // Pin precision to PCM_16 — Resemble defaults to PCM_32 (float WAV) which the stitch decoder rejects.
    // sample_rate is a string enum; without it the API picks an undocumented default.
    return {
      providerOptions: { precision: "PCM_16", sample_rate: String(rate) },
      mediaType: "audio/wav",
    };
  }

  resolveOutputFormat(modelId: string, output: AudioOutput) {
    if (!this.models.some((m) => m.id === modelId)) {
      return;
    }
    const rate = resolveSampleRate(
      `resemble/${modelId}`,
      this.supportedSampleRates(modelId),
      output.sampleRate
    );
    switch (output.format) {
      case "wav":
        // Pin precision to PCM_16 — Resemble defaults to PCM_32 (float WAV) which downstream decoders reject.
        return {
          providerOptions: {
            output_format: "wav",
            precision: "PCM_16",
            sample_rate: String(rate),
          },
          expectedMediaType: "audio/wav",
        };
      case "mp3":
        return {
          providerOptions: { output_format: "mp3", sample_rate: String(rate) },
          expectedMediaType: "audio/mpeg",
        };
      case "pcm":
        // No native pcm container; request wav (PCM_16) and let the SDK unwrap via mediabunny.
        return {
          providerOptions: {
            output_format: "wav",
            precision: "PCM_16",
            sample_rate: String(rate),
          },
          expectedMediaType: "audio/wav",
        };
      default:
        return;
    }
  }

  async designVoice(
    options: DesignVoiceProviderRequest
  ): Promise<DesignVoiceProviderResult> {
    const authHeader = `Bearer ${resolveApiKey(this.apiKey, "RESEMBLE_API_KEY", "Resemble")}`;

    const designResponse = await this.fetchFn(
      `${this.appBaseURL}/voice-design`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
          "X-User-Agent": SDK_USER_AGENT,
          ...options.headers,
        },
        body: JSON.stringify({
          ...options.providerOptions,
          user_prompt: options.description,
        }),
        signal: options.abortSignal,
      }
    );

    await handleErrorResponse(designResponse);

    const designJson = (await designResponse.json()) as {
      samples?: ResembleDesignSample[];
      uuid?: unknown;
      voice_candidates?: ResembleDesignCandidate | ResembleDesignCandidate[];
    };
    // Resemble has shipped both shapes: an object candidate (`voice_design_model_uuid` + nested `samples`) and an array of candidates (`uuid` + `voice_sample_index` on each). Support both.
    const candidates = designJson.voice_candidates;
    const candidate = Array.isArray(candidates) ? candidates[0] : candidates;
    const uuid =
      asString(candidate?.voice_design_model_uuid) ??
      asString(candidate?.uuid) ??
      asString(designJson.uuid);
    if (!uuid) {
      throw new SpeechSDKError(
        "resemble: voice design response missing voice design model uuid"
      );
    }
    const sample =
      (Array.isArray(candidates)
        ? candidate
        : (candidate?.samples?.[0] ?? designJson.samples?.[0])) ?? {};
    const sampleIndex =
      asNumber(sample.sample_index) ?? asNumber(sample.voice_sample_index) ?? 0;
    const audioUrl = asString(sample.audio_url);

    const createForm = new FormData();
    createForm.append("voice_name", options.name);

    const createResponse = await this.fetchFn(
      `${this.appBaseURL}/voice-design/${uuid}/${sampleIndex}/create_rapid_voice`,
      {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "X-User-Agent": SDK_USER_AGENT,
          ...options.headers,
        },
        body: createForm,
        signal: options.abortSignal,
      }
    );

    await handleErrorResponse(createResponse);

    const createJson = (await createResponse.json()) as {
      voice_uuid?: unknown;
    };
    const voiceId = createJson.voice_uuid;
    if (typeof voiceId !== "string") {
      throw new SpeechSDKError(
        "resemble: create_rapid_voice response missing voice_uuid"
      );
    }

    const preview = audioUrl
      ? await this.fetchPreview(audioUrl, options)
      : undefined;

    return {
      voiceId,
      ...(preview && { preview }),
      providerMetadata: createJson as Record<string, unknown>,
    };
  }

  private async fetchPreview(
    url: string,
    options: { abortSignal?: AbortSignal }
  ): Promise<{ audio: Uint8Array; mediaType: string } | undefined> {
    const response = await this.fetchFn(url, { signal: options.abortSignal });
    if (!response.ok) {
      return;
    }
    return {
      audio: new Uint8Array(await response.arrayBuffer()),
      mediaType: response.headers.get("content-type") ?? "audio/wav",
    };
  }
}

interface ResembleDesignSample {
  audio_url?: unknown;
  sample_index?: unknown;
  voice_sample_index?: unknown;
}

interface ResembleDesignCandidate extends ResembleDesignSample {
  samples?: ResembleDesignSample[];
  uuid?: unknown;
  voice_design_model_uuid?: unknown;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function resembleMediaType(outputFormat: unknown): string {
  switch (typeof outputFormat === "string" ? outputFormat.toLowerCase() : "") {
    case "mp3":
      return "audio/mpeg";
    default:
      return "audio/wav";
  }
}

export function createResemble(config: ResembleSpeechProviderConfig = {}) {
  const provider = new ResembleSpeechProvider(config);
  const fallbackSTT = config.fallbackSTT;

  return function resemble(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
      ...(fallbackSTT && { fallbackSTT }),
    };
  };
}
