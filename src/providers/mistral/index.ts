import {
  handleErrorResponse,
  resolveApiKey,
  SDK_USER_AGENT,
} from "../../provider-utils.js";
import type {
  ModelInfo,
  ResolvedModel,
  SpeechProvider,
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
    features: ["streaming", "open-source", "inline-voice-cloning"],
  },
] as const;

export class MistralSpeechProvider
  implements SpeechProvider<string, string | { audio: string | Uint8Array }>
{
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
    voice?: string | { audio: string | Uint8Array };
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
      if (typeof options.voice === "string") {
        body.voice_id = options.voice;
      } else if ("audio" in options.voice) {
        const audio = options.voice.audio;
        if (audio instanceof Uint8Array) {
          let binaryString = "";
          for (const byte of audio) {
            binaryString += String.fromCharCode(byte);
          }
          body.ref_audio = btoa(binaryString);
        } else {
          body.ref_audio = audio;
        }
      }
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

    await handleErrorResponse(response, `mistral/${options.modelId}`);

    const json = (await response.json()) as {
      audio_data: string;
      usage?: { audio_duration_seconds?: number };
    };

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
    voice?: string | { audio: string | Uint8Array };
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
      if (typeof options.voice === "string") {
        body.voice_id = options.voice;
      } else if ("audio" in options.voice) {
        const audio = options.voice.audio;
        if (audio instanceof Uint8Array) {
          let binaryString = "";
          for (const byte of audio) {
            binaryString += String.fromCharCode(byte);
          }
          body.ref_audio = btoa(binaryString);
        } else {
          body.ref_audio = audio;
        }
      }
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

    await handleErrorResponse(response, `mistral/${options.modelId}`);

    if (!response.body) {
      throw new Error(`mistral/${options.modelId}: response has no body`);
    }

    const { stream } = parseSseBase64Stream(response.body, {
      extractBase64(eventData) {
        const json = safeParseJson(eventData) as {
          type?: string;
          audio_data?: unknown;
        } | null;
        if (
          json?.type === "speech.audio.delta" &&
          typeof json.audio_data === "string"
        ) {
          return json.audio_data;
        }
        return null;
      },
      extractMetadata(eventData) {
        const json = safeParseJson(eventData) as {
          type?: string;
          usage?: Record<string, unknown>;
        } | null;
        if (json?.type === "speech.audio.done" && json.usage) {
          return { usage: json.usage };
        }
        return null;
      },
    });

    return {
      stream,
      mediaType: mediaTypeForResponseFormat(body.response_format),
    };
  }

  getStitchOptions(modelId: string) {
    if (this.models.some((m) => m.id === modelId)) {
      // voxtral's `pcm` format is headerless float32 little-endian, mono,
      // 24 kHz — declared via the `encoding=float32` mediaType param so the
      // stitch decoder converts to int16 before concatenation.
      return {
        providerOptions: { response_format: "pcm" },
        mediaType: "audio/pcm;rate=24000;encoding=float32",
      };
    }
    return undefined;
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
  return function mistral(
    modelId?: string
  ): ResolvedModel<string | { audio: string | Uint8Array }> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
      ...(fallbackSTT && { fallbackSTT }),
    };
  };
}
