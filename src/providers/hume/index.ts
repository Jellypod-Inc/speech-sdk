import { z } from "zod";
import type { AudioOutput } from "../../audio-output.js";
import { base64ToUint8Array } from "../../audio-utils.js";
import { SpeechSDKError } from "../../errors.js";
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
import type { WordTimestamp } from "../../timestamps.js";
import { humeSnippetSchema, snippetsToWordTimestamps } from "./alignment.js";

const ttsResponseSchema = z.object({
  generations: z
    .array(
      z.object({
        audio: z.string().optional(),
        snippets: z.array(z.array(humeSnippetSchema)).optional(),
      })
    )
    .optional(),
});

export interface HumeSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fallbackSTT?: ResolvedSTTModel;
  fetch?: typeof globalThis.fetch;
}

export const HUME_PROVIDER_ID = "hume" as const;

export const HUME_MODELS: readonly ModelInfo[] = [
  {
    id: "octave-2",
    releaseDate: "2025-10-01",
    languages: [
      "en",
      "fr",
      "de",
      "es",
      "pt",
      "ja",
      "ko",
      "hi",
      "it",
      "ar",
      "ru",
    ] as const,
    features: ["streaming", "inline-voice-cloning", "timestamps"],
    maxInputChars: 5000,
  },
  {
    id: "octave-1",
    releaseDate: "2025-03-01",
    languages: ["en"] as const,
    features: ["streaming"],
    maxInputChars: 5000,
  },
] as const;

export class HumeSpeechProvider implements SpeechProvider<string, string> {
  readonly id = HUME_PROVIDER_ID;
  readonly defaultModel = "octave-2";

  readonly models = HUME_MODELS;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: HumeSpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? "https://api.hume.ai/v0";
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private resolveVersion(modelId: string): string | undefined {
    if (modelId === "octave-2") {
      return "2";
    }
    if (modelId === "octave-1") {
      return "1";
    }
    return;
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
    mediaType: string;
    providerMetadata?: Record<string, unknown>;
    timestamps?: WordTimestamp[];
  }> {
    const utterance: Record<string, unknown> = { text: options.text };
    if (options.voice) {
      utterance.voice = { name: options.voice, provider: "HUME_AI" };
    }

    const version = this.resolveVersion(options.modelId);

    const body: Record<string, unknown> = {
      ...options.providerOptions,
      utterances: [utterance],
    };

    if (version != null) {
      body.version = version;
    }

    // Native timestamps are Octave-2 only and only on JSON /v0/tts (/v0/tts/file is bytes-only).
    if (options.includeTimestamps && version === "2") {
      return this.generateWithTimestamps(options, body);
    }

    const url = `${this.baseURL}/tts/file`;

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hume-Api-Key": resolveApiKey(this.apiKey, "HUME_API_KEY", "Hume"),
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);

    const arrayBuffer = await response.arrayBuffer();
    const mediaType = response.headers.get("content-type") ?? "audio/mpeg";

    return {
      audio: new Uint8Array(arrayBuffer),
      mediaType,
    };
  }

  private async generateWithTimestamps(
    options: {
      modelId: string;
      providerOptions?: Record<string, unknown>;
      abortSignal?: AbortSignal;
      headers?: Record<string, string>;
    },
    baseBody: Record<string, unknown>
  ): Promise<{
    audio: Uint8Array;
    mediaType: string;
    providerMetadata?: Record<string, unknown>;
    timestamps?: WordTimestamp[];
  }> {
    // split_utterances:false keeps one snippet per utterance so timestamps line up byte-for-byte with returned audio.
    const body: Record<string, unknown> = {
      ...baseBody,
      include_timestamp_types: ["word"],
      split_utterances: false,
    };

    const url = `${this.baseURL}/tts`;
    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hume-Api-Key": resolveApiKey(this.apiKey, "HUME_API_KEY", "Hume"),
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);

    const payload = ttsResponseSchema.parse(await response.json());
    const gen = payload.generations?.[0];
    if (!gen?.audio) {
      throw new SpeechSDKError(
        `hume/${options.modelId}: /v0/tts response missing generations[0].audio`
      );
    }

    const audio = base64ToUint8Array(gen.audio);
    const timestamps = gen.snippets
      ? snippetsToWordTimestamps(gen.snippets)
      : undefined;

    // No Content-Type for base64-in-JSON audio bytes; derive from requested format.
    const format = (baseBody.format ?? {}) as { type?: string };
    return {
      audio,
      mediaType: humeFormatToMediaType(format.type),
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
    const utterance: Record<string, unknown> = { text: options.text };
    if (options.voice) {
      utterance.voice = { name: options.voice, provider: "HUME_AI" };
    }

    const version = this.resolveVersion(options.modelId);

    const body: Record<string, unknown> = {
      ...options.providerOptions,
      utterances: [utterance],
    };
    if (version != null) {
      body.version = version;
    }

    const url = `${this.baseURL}/tts/stream/file`;

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hume-Api-Key": resolveApiKey(this.apiKey, "HUME_API_KEY", "Hume"),
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);

    if (!response.body) {
      throw new Error(`hume/${options.modelId}: response has no body`);
    }

    return {
      stream: response.body,
      mediaType: response.headers.get("content-type") ?? "audio/mpeg",
    };
  }

  supportedSampleRates(modelId: string): readonly number[] {
    if (!this.models.some((m) => m.id === modelId)) {
      return [];
    }
    // Hume Octave is always 48 kHz mono s16 PCM; /v0/tts/file has no rate option.
    return [48_000];
  }

  getStitchOptions(modelId: string, opts?: { sampleRate?: number }) {
    if (!this.models.some((m) => m.id === modelId)) {
      return;
    }
    resolveSampleRate(
      `hume/${modelId}`,
      this.supportedSampleRates(modelId),
      opts?.sampleRate
    );
    return {
      providerOptions: { format: { type: "pcm" } },
      mediaType: "audio/pcm;rate=48000",
    };
  }

  resolveOutputFormat(modelId: string, output: AudioOutput) {
    if (!this.models.some((m) => m.id === modelId)) {
      return;
    }
    resolveSampleRate(
      `hume/${modelId}`,
      this.supportedSampleRates(modelId),
      output.sampleRate
    );
    switch (output.format) {
      case "wav":
        return {
          providerOptions: { format: { type: "wav" } },
          expectedMediaType: "audio/wav",
        };
      case "mp3":
        return {
          providerOptions: { format: { type: "mp3" } },
          expectedMediaType: "audio/mpeg",
        };
      case "pcm":
        return {
          providerOptions: { format: { type: "pcm" } },
          expectedMediaType: "audio/pcm;rate=48000",
        };
      default:
        return;
    }
  }

  dialogueCapabilities(modelId: string) {
    if (this.models.some((m) => m.id === modelId)) {
      // Hume publishes no hard maximum; cap conservatively at SDK-wide unique-voice ceiling of 4.
      return { minVoices: 1, maxVoices: 4 };
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
    const utterances = options.turns.map((t) => ({
      text: t.text,
      voice: { name: t.voice, provider: "HUME_AI" },
    }));

    const version = this.resolveVersion(options.modelId);
    const body: Record<string, unknown> = {
      ...options.providerOptions,
      utterances,
    };
    if (version != null) {
      body.version = version;
    }

    const url = `${this.baseURL}/tts/file`;
    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hume-Api-Key": resolveApiKey(this.apiKey, "HUME_API_KEY", "Hume"),
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);

    const arrayBuffer = await response.arrayBuffer();
    return {
      audio: new Uint8Array(arrayBuffer),
      mediaType: response.headers.get("content-type") ?? "audio/mpeg",
    };
  }
}

export function createHume(config: HumeSpeechProviderConfig = {}) {
  const provider = new HumeSpeechProvider(config);
  const fallbackSTT = config.fallbackSTT;

  return function hume(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
      ...(fallbackSTT && { fallbackSTT }),
    };
  };
}

// Hume's PCM mode is always 48 kHz mono s16.
function humeFormatToMediaType(formatType: string | undefined): string {
  if (!formatType) {
    return "audio/mpeg";
  }
  if (formatType === "wav") {
    return "audio/wav";
  }
  if (formatType === "pcm") {
    return "audio/pcm;rate=48000";
  }
  return "audio/mpeg";
}
