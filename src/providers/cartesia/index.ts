import {
  type AudioOutput,
  DEFAULT_MP3_BITRATE_KBPS,
} from "../../audio-output.js";
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
  resolveSampleRate,
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

const CARTESIA_PCM_RATES = [
  8000, 16_000, 22_050, 24_000, 44_100, 48_000,
] as const;

const SONIC_LANGUAGES = [
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
] as const;

export const CARTESIA_MODELS: readonly ModelInfo[] = [
  {
    id: "sonic-3.5",
    releaseDate: "2026-05-04",
    languages: SONIC_LANGUAGES,
    features: ["streaming", "audio-tags", "inline-voice-cloning", "timestamps"],
  },
  {
    id: "sonic-3",
    releaseDate: "2025-10-27",
    languages: SONIC_LANGUAGES,
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
  readonly defaultModel = "sonic-3.5";

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
    const mediaType = cartesiaMediaTypeForBody(body);

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
    // Force raw pcm_s16le @ 24kHz — Cartesia SSE wav/mp3 chunks aren't safely concat-able.
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
      mediaType: cartesiaMediaTypeForBody(body),
    };
  }

  supportedSampleRates(modelId: string): readonly number[] {
    if (!this.models.some((m) => m.id === modelId)) {
      return [];
    }
    return CARTESIA_PCM_RATES;
  }

  getStitchOptions(modelId: string, opts?: { sampleRate?: number }) {
    if (!this.models.some((m) => m.id === modelId)) {
      return;
    }
    const rate = resolveSampleRate(
      `cartesia/${modelId}`,
      this.supportedSampleRates(modelId),
      opts?.sampleRate
    );
    return {
      providerOptions: {
        output_format: {
          container: "wav",
          encoding: "pcm_s16le",
          sample_rate: rate,
        },
      },
      mediaType: "audio/wav",
    };
  }

  resolveOutputFormat(modelId: string, output: AudioOutput) {
    if (!this.models.some((m) => m.id === modelId)) {
      return;
    }
    switch (output.format) {
      case "wav": {
        const rate = resolveSampleRate(
          `cartesia/${modelId}`,
          this.supportedSampleRates(modelId),
          output.sampleRate
        );
        return {
          providerOptions: {
            output_format: {
              container: "wav",
              encoding: "pcm_s16le",
              sample_rate: rate,
            },
          },
          expectedMediaType: "audio/wav",
        };
      }
      case "pcm": {
        const rate = resolveSampleRate(
          `cartesia/${modelId}`,
          this.supportedSampleRates(modelId),
          output.sampleRate
        );
        return {
          providerOptions: {
            output_format: {
              container: "raw",
              encoding: "pcm_s16le",
              sample_rate: rate,
            },
          },
          expectedMediaType: `audio/pcm;rate=${rate}`,
        };
      }
      case "mp3": {
        const rate = resolveSampleRate(
          `cartesia/${modelId}`,
          this.supportedSampleRates(modelId),
          output.sampleRate
        );
        const bitrate = output.bitrate ?? DEFAULT_MP3_BITRATE_KBPS;
        const supportedBitrates = [32, 64, 96, 128, 192];
        const closest = supportedBitrates.reduce((prev, curr) =>
          Math.abs(curr - bitrate) < Math.abs(prev - bitrate) ? curr : prev
        );
        return {
          providerOptions: {
            output_format: {
              container: "mp3",
              bit_rate: closest * 1000,
              sample_rate: rate,
            },
          },
          expectedMediaType: "audio/mpeg",
        };
      }
      default:
        return;
    }
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

// Cartesia returns raw bytes when container="raw"; derive mediaType from the requested body so callers always know the rate.
function cartesiaMediaTypeForBody(body: Record<string, unknown>): string {
  const output = body.output_format as
    | { container?: unknown; sample_rate?: unknown; encoding?: unknown }
    | undefined;
  const container = output?.container;
  if (container === "wav") {
    return "audio/wav";
  }
  if (container === "mp3") {
    return "audio/mpeg";
  }
  if (container === "raw") {
    const rate =
      typeof output?.sample_rate === "number" ? output.sample_rate : null;
    if (rate == null) {
      throw new SpeechSDKError(
        "cartesia: output_format.container=raw requires output_format.sample_rate"
      );
    }
    const encoding = String(output?.encoding ?? "");
    return encoding === "pcm_f32le"
      ? `audio/pcm;rate=${rate};encoding=float32`
      : `audio/pcm;rate=${rate}`;
  }
  return "audio/wav";
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
