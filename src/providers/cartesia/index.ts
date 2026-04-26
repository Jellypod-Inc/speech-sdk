import { detectAudioTags, stripAudioTags } from "../../audio-tags.js";
import { base64ToUint8Array, wrapPcm16Mono } from "../../audio-utils.js";
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
  type CartesiaWordTimestamps,
  mergeWordTimestampMessages,
} from "./alignment.js";

export interface CartesiaSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fallbackSTT?: ResolvedSTTModel;
  fetch?: typeof globalThis.fetch;
}

export const CARTESIA_PROVIDER_ID = "cartesia" as const;

export const CARTESIA_MODELS: readonly ModelInfo[] = [
  {
    id: "sonic-3",
    releaseDate: "2025-10-27",
    languages: [
      "en",
      "fr",
      "de",
      "es",
      "pt",
      "zh",
      "ja",
      "hi",
      "it",
      "ko",
      "nl",
      "pl",
      "ru",
      "sv",
      "tr",
      "tl",
      "bg",
      "ro",
      "ar",
      "cs",
      "el",
      "fi",
      "hr",
      "ms",
      "sk",
      "da",
      "ta",
      "uk",
      "hu",
      "no",
      "vi",
      "bn",
      "th",
      "he",
      "ka",
      "id",
      "te",
      "gu",
      "kn",
      "ml",
      "mr",
      "pa",
    ],
    features: ["streaming", "audio-tags", "inline-voice-cloning", "timestamps"],
  },
  {
    id: "sonic-2",
    releaseDate: "2025-03-13",
    languages: ["en"],
    features: ["streaming", "timestamps"],
  },
] as const;

export class CartesiaSpeechProvider implements SpeechProvider<string, string> {
  readonly id = CARTESIA_PROVIDER_ID;
  readonly defaultModel = "sonic-3";

  readonly models = CARTESIA_MODELS;

  private static readonly PASSTHROUGH_TAGS = ["laughter"] as const;

  private static readonly EMOTIONS = [
    "neutral",
    "angry",
    "excited",
    "content",
    "sad",
    "scared",
    "happy",
    "euphoric",
    "anxious",
    "panicked",
    "calm",
    "confident",
    "curious",
    "frustrated",
    "sarcastic",
    "melancholic",
    "surprised",
    "disgusted",
    "contemplative",
    "determined",
    "proud",
    "distant",
    "skeptical",
    "mysterious",
    "anticipation",
    "grateful",
    "affectionate",
    "sympathetic",
    "nostalgic",
    "wistful",
    "apologetic",
    "hesitant",
    "insecure",
    "confused",
    "resigned",
    "alarmed",
    "bored",
    "tired",
    "rejected",
    "hurt",
    "disappointed",
    "dejected",
    "guilty",
    "envious",
    "contempt",
    "threatened",
    "agitated",
    "outraged",
    "mad",
    "triumphant",
    "amazed",
    "flirtatious",
    "joking/comedic",
    "serene",
    "peaceful",
    "enthusiastic",
    "elated",
    "trust",
  ] as const;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: CartesiaSpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? "https://api.cartesia.ai";
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  processAudioTags(
    text: string,
    modelId: string
  ): { text: string; warnings: string[] } {
    if (
      !this.models.some((m) => m.id === modelId && hasFeature(m, "audio-tags"))
    ) {
      return stripAudioTags(text, `cartesia/${modelId}`);
    }

    const tags = detectAudioTags(text);
    if (tags.length === 0) {
      return { text, warnings: [] };
    }

    const warnings: string[] = [];
    let processed = text;

    for (const tag of tags) {
      const inner = tag.slice(1, -1).toLowerCase();

      if (
        (CartesiaSpeechProvider.PASSTHROUGH_TAGS as readonly string[]).includes(
          inner
        )
      ) {
        continue;
      }

      if (
        (CartesiaSpeechProvider.EMOTIONS as readonly string[]).includes(inner)
      ) {
        processed = processed.replace(tag, `<emotion value="${inner}"/>`);
        continue;
      }

      warnings.push(
        `Audio tag ${tag} is not supported by cartesia/${modelId} and was removed.`
      );
      processed = processed.replace(tag, "");
    }

    processed = processed.replace(/\s+/g, " ").trim();
    return { text: processed, warnings };
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
    // /tts/bytes is audio-only; word timing requires the SSE endpoint.
    if (options.includeTimestamps) {
      return this.generateWithTimestamps(options);
    }

    const url = `${this.baseURL}/tts/bytes`;

    const body: Record<string, unknown> = {
      output_format: {
        container: "wav",
        encoding: "pcm_f32le",
        sample_rate: 44_100,
      },
      ...options.providerOptions,
      model_id: options.modelId,
      transcript: options.text,
      voice: { mode: "id", id: options.voice },
    };

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": resolveApiKey(this.apiKey, "CARTESIA_API_KEY", "Cartesia"),
        "Cartesia-Version": "2025-04-16",
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);

    const arrayBuffer = await response.arrayBuffer();
    const mediaType = response.headers.get("content-type") ?? "audio/wav";

    return {
      audio: new Uint8Array(arrayBuffer),
      mediaType,
    };
  }

  private async generateWithTimestamps(options: {
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
    timestamps?: WordTimestamp[];
  }> {
    // Force raw pcm_s16le @ 24kHz: the SDK concatenates chunks directly and
    // wraps them in a WAV header at end-of-stream. Allowing a caller to
    // override the container would corrupt the merged audio since Cartesia
    // SSE's wav/mp3 chunks are not safely concat-able.
    const sampleRate = 24_000;
    const body: Record<string, unknown> = {
      ...options.providerOptions,
      model_id: options.modelId,
      transcript: options.text,
      voice: { mode: "id", id: options.voice },
      output_format: {
        container: "raw",
        encoding: "pcm_s16le",
        sample_rate: sampleRate,
      },
      add_timestamps: true,
    };

    const url = `${this.baseURL}/tts/sse`;
    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": resolveApiKey(this.apiKey, "CARTESIA_API_KEY", "Cartesia"),
        "Cartesia-Version": "2025-04-16",
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);

    if (!response.body) {
      throw new SpeechSDKError(
        `cartesia/${options.modelId}: /tts/sse response has no body`
      );
    }

    const { audio: pcmAudio, timestamps } = await collectCartesiaSse(
      response.body,
      `cartesia/${options.modelId}`
    );

    // Concatenated PCM → standard WAV file, so callers don't need to know
    // sample rate / encoding out-of-band to decode.
    const audio = await wrapPcm16Mono(pcmAudio, sampleRate);
    return {
      audio,
      mediaType: "audio/wav",
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
    const url = `${this.baseURL}/tts/bytes`;

    const body: Record<string, unknown> = {
      output_format: {
        container: "wav",
        encoding: "pcm_f32le",
        sample_rate: 44_100,
      },
      ...options.providerOptions,
      model_id: options.modelId,
      transcript: options.text,
      voice: { mode: "id", id: options.voice },
    };

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": resolveApiKey(this.apiKey, "CARTESIA_API_KEY", "Cartesia"),
        "Cartesia-Version": "2025-04-16",
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);

    if (!response.body) {
      throw new Error(`cartesia/${options.modelId}: response has no body`);
    }

    return {
      stream: response.body,
      mediaType: response.headers.get("content-type") ?? "audio/wav",
    };
  }

  getStitchOptions(modelId: string) {
    if (this.models.some((m) => m.id === modelId)) {
      return {
        providerOptions: {
          output_format: {
            container: "wav",
            encoding: "pcm_s16le",
            sample_rate: 24_000,
          },
        },
        mediaType: "audio/wav",
      };
    }
    return undefined;
  }
}

export function createCartesia(config: CartesiaSpeechProviderConfig = {}) {
  const provider = new CartesiaSpeechProvider(config);
  const fallbackSTT = config.fallbackSTT;

  return function cartesia(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
      ...(fallbackSTT && { fallbackSTT }),
    };
  };
}

interface CartesiaSseEvent {
  data?: string;
  done?: boolean;
  type?: string;
  word_timestamps?: CartesiaWordTimestamps;
}

const SSE_LEADING_SPACE = /^ /;

// Server interleaves chunk + timestamps events; collect both in arrival order.
async function collectCartesiaSse(
  body: ReadableStream<Uint8Array>,
  modelLabel: string
): Promise<{
  audio: Uint8Array;
  timestamps: WordTimestamp[];
}> {
  const audioParts: Uint8Array[] = [];
  const timestampMessages: CartesiaWordTimestamps[] = [];

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const flushEvent = (raw: string): void => {
    const dataLines: string[] = [];
    for (const rawLine of raw.split("\n")) {
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).replace(SSE_LEADING_SPACE, ""));
      }
    }
    if (dataLines.length === 0) {
      return;
    }
    const json = dataLines.join("\n");
    let parsed: CartesiaSseEvent;
    try {
      parsed = JSON.parse(json) as CartesiaSseEvent;
    } catch {
      throw new SpeechSDKError(
        `${modelLabel}: malformed SSE event payload (not JSON)`
      );
    }
    if (parsed.type === "chunk" && typeof parsed.data === "string") {
      audioParts.push(base64ToUint8Array(parsed.data));
    } else if (parsed.type === "timestamps" && parsed.word_timestamps) {
      timestampMessages.push(parsed.word_timestamps);
    } else if (parsed.type === "error") {
      throw new SpeechSDKError(
        `${modelLabel}: SSE error: ${JSON.stringify(parsed)}`
      );
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        if (buffer.length > 0) {
          flushEvent(buffer);
        }
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let sepIndex = buffer.indexOf("\n\n");
      while (sepIndex !== -1) {
        const raw = buffer.slice(0, sepIndex);
        buffer = buffer.slice(sepIndex + 2);
        flushEvent(raw);
        sepIndex = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }

  const totalLen = audioParts.reduce((n, p) => n + p.byteLength, 0);
  const audio = new Uint8Array(totalLen);
  let offset = 0;
  for (const part of audioParts) {
    audio.set(part, offset);
    offset += part.byteLength;
  }
  return {
    audio,
    timestamps: mergeWordTimestampMessages(timestampMessages),
  };
}
