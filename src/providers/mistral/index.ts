import { z } from "zod";
import type { AudioOutput } from "../../audio-output.js";
import { uint8ArrayToBase64 } from "../../audio-utils.js";
import { extensionForMediaType } from "../../clone-voice.js";
import { SpeechSDKError } from "../../errors.js";
import {
  handleErrorResponse,
  resolveApiKey,
  SDK_USER_AGENT,
} from "../../provider-utils.js";
import {
  type CloneVoiceProviderRequest,
  type CloneVoiceProviderResult,
  type ModelInfo,
  type ResolvedModel,
  resolveSampleRate,
  type SpeechProvider,
} from "../../speech-provider.js";
import type { ResolvedSTTModel } from "../../speech-to-text-provider.js";
import { parseSseBase64Stream } from "../../sse-stream.js";

function safeParseJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

const speechResponseSchema = z.object({
  audio_data: z.string(),
  usage: z.object({ audio_duration_seconds: z.number().optional() }).optional(),
});

const audioDeltaEventSchema = z.object({
  type: z.literal("speech.audio.delta"),
  audio_data: z.string(),
});

const audioDoneEventSchema = z.object({
  type: z.literal("speech.audio.done"),
  usage: z.record(z.string(), z.unknown()),
});

export interface MistralSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fallbackSTT?: ResolvedSTTModel;
  fetch?: typeof globalThis.fetch;
}

export const MISTRAL_PROVIDER_ID = "mistral" as const;

export const MISTRAL_MODELS: readonly ModelInfo[] = [
  {
    id: "voxtral-mini-tts-2603",
    releaseDate: "2026-03-23",
    languages: ["en", "fr", "de", "es", "nl", "pt", "it", "hi", "ar"] as const,
    features: ["streaming", "open-source", "voice-cloning"],
  },
] as const;

export class MistralSpeechProvider implements SpeechProvider<string, string> {
  readonly id = MISTRAL_PROVIDER_ID;
  readonly defaultModel = "voxtral-mini-tts-2603";
  readonly models = MISTRAL_MODELS;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: MistralSpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? "https://api.mistral.ai/v1";
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
    audio: string;
    audioDurationMs?: number;
    mediaType: string;
  }> {
    const body: Record<string, unknown> = {
      response_format: "mp3",
      ...options.providerOptions,
      model: options.modelId,
      input: options.text,
    };

    if (options.voice != null) {
      body.voice_id = options.voice;
    }

    const url = `${this.baseURL}/audio/speech`;

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolveApiKey(this.apiKey, "MISTRAL_API_KEY", "Mistral")}`,
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, {
      provider: this.id,
      model: options.modelId,
      stage: "synthesis",
    });

    const json = speechResponseSchema.parse(await response.json());

    const audioDurationMs =
      json.usage?.audio_duration_seconds == null
        ? undefined
        : Math.round(json.usage.audio_duration_seconds * 1000);

    return {
      audio: json.audio_data,
      audioDurationMs,
      mediaType: mediaTypeForResponseFormat(body.response_format),
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
    const body: Record<string, unknown> = {
      response_format: "mp3",
      ...options.providerOptions,
      model: options.modelId,
      input: options.text,
      stream: true,
    };

    if (options.voice != null) {
      body.voice_id = options.voice;
    }

    const url = `${this.baseURL}/audio/speech`;

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolveApiKey(this.apiKey, "MISTRAL_API_KEY", "Mistral")}`,
        Accept: "text/event-stream",
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, {
      provider: this.id,
      model: options.modelId,
      stage: "synthesis",
    });

    if (!response.body) {
      throw new Error(`mistral/${options.modelId}: response has no body`);
    }

    const { stream } = parseSseBase64Stream(response.body, {
      extractBase64(eventData) {
        const result = audioDeltaEventSchema.safeParse(
          safeParseJson(eventData)
        );
        return result.success ? result.data.audio_data : null;
      },
      extractMetadata(eventData) {
        const result = audioDoneEventSchema.safeParse(safeParseJson(eventData));
        return result.success ? { usage: result.data.usage } : null;
      },
    });

    return {
      stream,
      mediaType: mediaTypeForResponseFormat(body.response_format),
    };
  }

  supportedSampleRates(modelId: string): readonly number[] {
    if (!this.models.some((m) => m.id === modelId)) {
      return [];
    }
    // voxtral pcm is fixed at 24 kHz mono float32 LE; the API exposes no rate selector.
    return [24_000];
  }

  getStitchOptions(modelId: string, opts?: { sampleRate?: number }) {
    if (!this.models.some((m) => m.id === modelId)) {
      return;
    }
    resolveSampleRate(
      `mistral/${modelId}`,
      this.supportedSampleRates(modelId),
      opts?.sampleRate
    );
    // voxtral pcm is headerless float32 LE 24kHz mono; encoding=float32 tells the stitch decoder to convert to int16.
    return {
      providerOptions: { response_format: "pcm" },
      mediaType: "audio/pcm;rate=24000;encoding=float32",
    };
  }

  resolveOutputFormat(modelId: string, output: AudioOutput) {
    if (!this.models.some((m) => m.id === modelId)) {
      return;
    }
    resolveSampleRate(
      `mistral/${modelId}`,
      this.supportedSampleRates(modelId),
      output.sampleRate
    );
    switch (output.format) {
      case "mp3":
        return {
          providerOptions: { response_format: "mp3" },
          expectedMediaType: "audio/mpeg",
        };
      case "pcm":
      case "wav":
        // voxtral pcm is headerless float32 LE 24kHz mono; encoding=float32 tells the decoder to convert to int16.
        return {
          providerOptions: { response_format: "pcm" },
          expectedMediaType: "audio/pcm;rate=24000;encoding=float32",
        };
      default:
        return;
    }
  }

  async cloneVoice(
    options: CloneVoiceProviderRequest
  ): Promise<CloneVoiceProviderResult> {
    const sample = options.samples[0];

    const body: Record<string, unknown> = {
      ...options.providerOptions,
      name: options.name,
      sample_audio: uint8ArrayToBase64(sample.bytes),
      sample_filename: `sample.${extensionForMediaType(sample.mediaType)}`,
    };

    const response = await this.fetchFn(`${this.baseURL}/audio/voices`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolveApiKey(this.apiKey, "MISTRAL_API_KEY", "Mistral")}`,
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, { provider: this.id });

    const json = (await response.json()) as { id?: unknown };
    const voiceId = json.id;
    if (typeof voiceId !== "string") {
      throw new SpeechSDKError("mistral: clone response missing id");
    }

    return { voiceId, providerMetadata: json as Record<string, unknown> };
  }
}

function mediaTypeForResponseFormat(format: unknown): string {
  switch (format) {
    case "wav":
      return "audio/wav";
    case "pcm":
      // voxtral's `pcm` is headerless float32 LE @ 24 kHz mono.
      return "audio/pcm;rate=24000;encoding=float32";
    case "flac":
      return "audio/flac";
    case "opus":
      return "audio/opus";
    default:
      return "audio/mpeg";
  }
}

export function createMistral(config: MistralSpeechProviderConfig = {}) {
  const provider = new MistralSpeechProvider(config);
  const fallbackSTT = config.fallbackSTT;
  return function mistral(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
      ...(fallbackSTT && { fallbackSTT }),
    };
  };
}
