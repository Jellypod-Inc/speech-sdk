import type { AudioOutput } from "../../audio-output.js";
import { cloneSampleFilename } from "../../clone-voice.js";
import { SpeechSDKError } from "../../errors.js";
import {
  handleErrorResponse,
  resolveApiKey,
  SDK_USER_AGENT,
} from "../../provider-utils.js";
import {
  type ModelInfo,
  type NormalizedSample,
  type ResolvedModel,
  resolveSampleRate,
  type SpeechProvider,
} from "../../speech-provider.js";
import type { ResolvedSTTModel } from "../../speech-to-text-provider.js";

const GRADIUM_PCM_RATES = [
  8000, 16_000, 22_050, 24_000, 44_100, 48_000,
] as const;
const GRADIUM_DEFAULT_PCM_RATE = 48_000;
const GRADIUM_PCM_OUTPUT_FORMAT_RE = /^pcm_(\d+)$/;

export interface GradiumSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fallbackSTT?: ResolvedSTTModel;
  fetch?: typeof globalThis.fetch;
}

export const GRADIUM_PROVIDER_ID = "gradium" as const;

export const GRADIUM_MODELS: readonly ModelInfo[] = [
  {
    id: "default",
    releaseDate: "2026-02-01",
    languages: ["en", "fr", "de", "es", "pt"],
    features: ["streaming", "voice-cloning"],
    maxInputChars: 20_000,
  },
] as const;

export class GradiumSpeechProvider implements SpeechProvider<string, string> {
  readonly id = GRADIUM_PROVIDER_ID;
  readonly defaultModel = "default";
  readonly models = GRADIUM_MODELS;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: GradiumSpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? "https://api.gradium.ai/api";
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
    const response = await this.fetchSpeech(options);
    const arrayBuffer = await response.arrayBuffer();

    return {
      audio: new Uint8Array(arrayBuffer),
      mediaType: gradiumMediaTypeForOutputFormat(
        options.providerOptions?.output_format ?? "wav",
        response.headers.get("content-type")
      ),
    };
  }

  async cloneVoice(options: {
    modelId: string;
    samples: NormalizedSample[];
    name: string;
    language?: string;
    providerOptions?: Record<string, unknown>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<{
    voiceId: string;
    warnings?: string[];
    providerMetadata?: Record<string, unknown>;
  }> {
    const form = new FormData();
    form.append("name", options.name);
    for (const [key, value] of Object.entries(options.providerOptions ?? {})) {
      form.append(key, coerceFormValue(value));
    }
    const sample = options.samples[0];
    form.append(
      "audio_file",
      new Blob([sample.bytes as BlobPart], { type: sample.mediaType }),
      cloneSampleFilename(sample, 0)
    );

    const response = await this.fetchFn(`${this.baseURL}/voices/`, {
      method: "POST",
      headers: {
        "x-api-key": resolveApiKey(this.apiKey, "GRADIUM_API_KEY", "Gradium"),
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: form,
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);

    const json = (await response.json()) as Record<string, unknown>;
    const voiceId = json.uid;
    if (typeof voiceId !== "string") {
      throw new SpeechSDKError(
        `gradium/${options.modelId}: clone response missing uid`
      );
    }

    return { voiceId, providerMetadata: json };
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
    const response = await this.fetchSpeech(options);

    if (!response.body) {
      throw new Error(`gradium/${options.modelId}: response has no body`);
    }

    return {
      stream: response.body,
      mediaType: gradiumMediaTypeForOutputFormat(
        options.providerOptions?.output_format ?? "wav",
        response.headers.get("content-type")
      ),
    };
  }

  supportedSampleRates(modelId: string): readonly number[] {
    if (!this.models.some((m) => m.id === modelId)) {
      return [];
    }
    return GRADIUM_PCM_RATES;
  }

  getStitchOptions(modelId: string, opts?: { sampleRate?: number }) {
    if (!this.models.some((m) => m.id === modelId)) {
      return;
    }
    const rate = resolveSampleRate(
      `gradium/${modelId}`,
      this.supportedSampleRates(modelId),
      opts?.sampleRate
    );
    return {
      providerOptions: { output_format: gradiumPcmOutputFormat(rate) },
      mediaType: `audio/pcm;rate=${rate}`,
    };
  }

  resolveOutputFormat(modelId: string, output: AudioOutput) {
    if (!this.models.some((m) => m.id === modelId)) {
      return;
    }
    switch (output.format) {
      case "wav": {
        const requestedRate = output.sampleRate;
        if (
          requestedRate == null ||
          requestedRate === GRADIUM_DEFAULT_PCM_RATE
        ) {
          if (requestedRate != null) {
            resolveSampleRate(
              `gradium/${modelId}`,
              this.supportedSampleRates(modelId),
              requestedRate
            );
          }
          return {
            providerOptions: { output_format: "wav" },
            expectedMediaType: "audio/wav",
          };
        }
        const rate = resolveSampleRate(
          `gradium/${modelId}`,
          this.supportedSampleRates(modelId),
          requestedRate
        );
        return {
          providerOptions: { output_format: gradiumPcmOutputFormat(rate) },
          expectedMediaType: `audio/pcm;rate=${rate}`,
        };
      }
      case "pcm": {
        const rate = resolveSampleRate(
          `gradium/${modelId}`,
          this.supportedSampleRates(modelId),
          output.sampleRate
        );
        return {
          providerOptions: { output_format: gradiumPcmOutputFormat(rate) },
          expectedMediaType: `audio/pcm;rate=${rate}`,
        };
      }
      case "mp3": {
        const rate = resolveSampleRate(
          `gradium/${modelId}`,
          this.supportedSampleRates(modelId),
          output.sampleRate
        );
        return {
          providerOptions: { output_format: gradiumPcmOutputFormat(rate) },
          expectedMediaType: `audio/pcm;rate=${rate}`,
        };
      }
      default:
        return;
    }
  }

  private async fetchSpeech(options: {
    modelId: string;
    text: string;
    voice?: string;
    providerOptions?: Record<string, unknown>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<Response> {
    if (!options.voice) {
      throw new Error(
        `gradium/${options.modelId}: "voice" is required and must be a Gradium voice_id.`
      );
    }

    const body: Record<string, unknown> = {
      output_format: "wav",
      ...options.providerOptions,
      model_name: options.modelId,
      text: options.text,
      voice_id: options.voice,
      only_audio: true,
    };

    const response = await this.fetchFn(`${this.baseURL}/post/speech/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": resolveApiKey(this.apiKey, "GRADIUM_API_KEY", "Gradium"),
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);
    return response;
  }
}

function coerceFormValue(value: unknown): string {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  return JSON.stringify(value);
}

function gradiumPcmOutputFormat(rate: number): string {
  return `pcm_${rate}`;
}

function gradiumMediaTypeForOutputFormat(
  outputFormat: unknown,
  contentType: string | null
): string {
  if (typeof outputFormat === "string") {
    if (outputFormat === "wav") {
      return "audio/wav";
    }
    if (outputFormat === "pcm") {
      return `audio/pcm;rate=${GRADIUM_DEFAULT_PCM_RATE}`;
    }
    const pcmRate = GRADIUM_PCM_OUTPUT_FORMAT_RE.exec(outputFormat)?.[1];
    if (pcmRate != null) {
      return `audio/pcm;rate=${pcmRate}`;
    }
    if (outputFormat === "opus") {
      return contentType ?? "audio/ogg;codecs=opus";
    }
  }
  return contentType ?? "audio/wav";
}

export function createGradium(config: GradiumSpeechProviderConfig = {}) {
  const provider = new GradiumSpeechProvider(config);
  const fallbackSTT = config.fallbackSTT;

  return function gradium(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
      ...(fallbackSTT && { fallbackSTT }),
    };
  };
}
