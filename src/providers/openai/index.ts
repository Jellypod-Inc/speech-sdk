import { z } from "zod";
import type { AudioOutput } from "../../audio-output.js";
import { stripAudioTags } from "../../audio-tags.js";
import { parseMediaTypeParam, wrapPcm16Mono } from "../../audio-utils.js";
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
import type {
  ResolvedSTTModel,
  SpeechToTextProvider,
} from "../../speech-to-text-provider.js";
import type { WordTimestamp } from "../../timestamps.js";
import { buildOpenAIInstructionsFromTags } from "./instructions.js";

const transcriptionResponseSchema = z.object({
  text: z.string().optional(),
  words: z
    .array(z.object({ word: z.string(), start: z.number(), end: z.number() }))
    .optional(),
});

export interface OpenAISpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fallbackSTT?: ResolvedSTTModel;
  fetch?: typeof globalThis.fetch;
}

export const OPENAI_PROVIDER_ID = "openai" as const;

const OPENAI_LANGUAGES = [
  "af",
  "ar",
  "bg",
  "bn",
  "bs",
  "ca",
  "cs",
  "cy",
  "da",
  "de",
  "el",
  "en",
  "es",
  "et",
  "fi",
  "fr",
  "gl",
  "gu",
  "he",
  "hi",
  "hr",
  "hu",
  "id",
  "is",
  "it",
  "ja",
  "jv",
  "ka",
  "kk",
  "km",
  "kn",
  "ko",
  "lo",
  "lt",
  "lv",
  "mk",
  "ml",
  "mn",
  "mr",
  "ms",
  "my",
  "ne",
  "nl",
  "no",
  "pa",
  "pl",
  "pt",
  "ro",
  "ru",
  "si",
  "sk",
  "sl",
  "so",
  "sq",
  "sr",
  "su",
  "sv",
  "sw",
  "ta",
  "te",
  "th",
  "tl",
  "tr",
  "uk",
  "ur",
  "vi",
  "zh",
] as const;

export const OPENAI_MODELS: readonly ModelInfo[] = [
  {
    id: "gpt-4o-mini-tts",
    releaseDate: "2025-03-20",
    languages: OPENAI_LANGUAGES,
    features: ["streaming", "audio-tags"],
    maxInputChars: 4096,
  },
  {
    id: "tts-1",
    releaseDate: "2023-11-06",
    languages: OPENAI_LANGUAGES,
    features: ["streaming"],
    maxInputChars: 4096,
  },
  {
    id: "tts-1-hd",
    releaseDate: "2023-11-06",
    languages: OPENAI_LANGUAGES,
    features: ["streaming"],
    maxInputChars: 4096,
  },
] as const;

export class OpenAISpeechProvider implements SpeechProvider<string, string> {
  readonly id = OPENAI_PROVIDER_ID;
  readonly defaultModel = "gpt-4o-mini-tts";

  readonly models = OPENAI_MODELS;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: OpenAISpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? "https://api.openai.com/v1";
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private buildRequestInput(
    modelId: string,
    text: string,
    providerOptions: Record<string, unknown> | undefined
  ): { input: string; instructions: string | undefined } {
    if (modelId !== "gpt-4o-mini-tts") {
      return { input: text, instructions: undefined };
    }

    const { text: cleaned, instructions: derived } =
      buildOpenAIInstructionsFromTags(text);

    const userInstructions = providerOptions?.instructions;
    const userInstructionsStr =
      typeof userInstructions === "string" && userInstructions.length > 0
        ? userInstructions
        : undefined;

    let instructions: string | undefined;
    if (userInstructionsStr && derived) {
      instructions = `${userInstructionsStr}\n\n${derived}`;
    } else if (userInstructionsStr) {
      instructions = userInstructionsStr;
    } else if (derived) {
      instructions = derived;
    }

    return { input: cleaned, instructions };
  }

  processAudioTags(
    text: string,
    modelId: string
  ): { text: string; warnings: string[] } {
    // Leave raw tags in place so generate() can extract them and build instructions in one pass.
    if (
      this.models.some((m) => m.id === modelId && hasFeature(m, "audio-tags"))
    ) {
      return { text, warnings: [] };
    }
    return stripAudioTags(text, `openai/${modelId}`);
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
    const { input, instructions } = this.buildRequestInput(
      options.modelId,
      options.text,
      options.providerOptions
    );

    const body: Record<string, unknown> = {
      ...options.providerOptions,
      model: options.modelId,
      input,
      voice: options.voice,
    };
    if (instructions !== undefined) {
      body.instructions = instructions;
    }

    const url = `${this.baseURL}/audio/speech`;

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolveApiKey(this.apiKey, "OPENAI_API_KEY", "OpenAI")}`,
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
    const { input, instructions } = this.buildRequestInput(
      options.modelId,
      options.text,
      options.providerOptions
    );

    const body: Record<string, unknown> = {
      ...options.providerOptions,
      model: options.modelId,
      input,
      voice: options.voice,
    };
    if (instructions !== undefined) {
      body.instructions = instructions;
    }

    const url = `${this.baseURL}/audio/speech`;

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolveApiKey(this.apiKey, "OPENAI_API_KEY", "OpenAI")}`,
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);

    if (!response.body) {
      throw new Error(`openai/${options.modelId}: response has no body`);
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
    return [24_000];
  }

  getStitchOptions(modelId: string, opts?: { sampleRate?: number }) {
    if (!this.models.some((m) => m.id === modelId)) {
      return;
    }
    resolveSampleRate(
      `openai/${modelId}`,
      this.supportedSampleRates(modelId),
      opts?.sampleRate
    );
    return {
      providerOptions: { response_format: "pcm" },
      mediaType: "audio/pcm;rate=24000",
    };
  }

  resolveOutputFormat(modelId: string, output: AudioOutput) {
    if (!this.models.some((m) => m.id === modelId)) {
      return;
    }
    resolveSampleRate(
      `openai/${modelId}`,
      this.supportedSampleRates(modelId),
      output.sampleRate
    );
    switch (output.format) {
      case "wav":
        return {
          providerOptions: { response_format: "wav" },
          expectedMediaType: "audio/wav",
        };
      case "mp3":
        return {
          providerOptions: { response_format: "mp3" },
          expectedMediaType: "audio/mpeg",
        };
      case "pcm":
        return {
          providerOptions: { response_format: "pcm" },
          expectedMediaType: "audio/pcm;rate=24000",
        };
      default:
        return;
    }
  }
}

// ISO-639-1 codes accepted by Whisper's `language` parameter.
const OPENAI_STT_LANGUAGES = [
  "af",
  "ar",
  "az",
  "be",
  "bg",
  "bn",
  "bs",
  "ca",
  "cs",
  "cy",
  "da",
  "de",
  "el",
  "en",
  "es",
  "et",
  "fa",
  "fi",
  "fr",
  "gl",
  "he",
  "hi",
  "hr",
  "hu",
  "hy",
  "id",
  "is",
  "it",
  "ja",
  "kk",
  "kn",
  "ko",
  "lt",
  "lv",
  "mi",
  "mk",
  "mr",
  "ms",
  "ne",
  "nl",
  "no",
  "pl",
  "pt",
  "ro",
  "ru",
  "sk",
  "sl",
  "sr",
  "sv",
  "sw",
  "ta",
  "th",
  "tl",
  "tr",
  "uk",
  "ur",
  "vi",
  "zh",
] as const;

// Only whisper-1 supports timestamp_granularities — gpt-4o-transcribe variants don't.
export class OpenAISpeechToTextProvider implements SpeechToTextProvider {
  readonly id = OPENAI_PROVIDER_ID;
  readonly defaultModel = "whisper-1";

  readonly models = [
    {
      id: "whisper-1",
      releaseDate: "2023-03-01",
      languages: OPENAI_STT_LANGUAGES,
    },
  ] as const;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: OpenAISpeechProviderConfig = {}) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? "https://api.openai.com/v1";
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async transcribe(options: {
    modelId: string;
    audio: Uint8Array;
    mediaType: string;
    language?: string;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<{
    timestamps: WordTimestamp[];
    text?: string;
    providerMetadata?: Record<string, unknown>;
  }> {
    const { audio, mediaType } = await normalizeAudioForOpenAI(
      options.audio,
      options.mediaType
    );

    const form = new FormData();
    const filename = `audio.${mediaTypeToExtension(mediaType)}`;
    // BlobPart cast — TS narrowing is stricter than runtime here.
    form.append(
      "file",
      new Blob([audio as BlobPart], { type: mediaType }),
      filename
    );
    form.append("model", options.modelId);
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "word");
    if (options.language) {
      form.append("language", options.language);
    }

    const response = await this.fetchFn(
      `${this.baseURL}/audio/transcriptions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resolveApiKey(this.apiKey, "OPENAI_API_KEY", "OpenAI")}`,
          "X-User-Agent": SDK_USER_AGENT,
          ...options.headers,
        },
        body: form,
        signal: options.abortSignal,
      }
    );

    await handleErrorResponse(response);

    const data = transcriptionResponseSchema.parse(await response.json());

    const timestamps: WordTimestamp[] = (data.words ?? []).map((w) => ({
      text: w.word,
      start: w.start,
      end: w.end,
    }));

    return {
      timestamps,
      text: data.text,
    };
  }
}

// OpenAI transcription rejects raw PCM; wrap as WAV. audio/l16 (RFC 2586, big-endian) intentionally unsupported.
async function normalizeAudioForOpenAI(
  audio: Uint8Array,
  mediaType: string
): Promise<{ audio: Uint8Array; mediaType: string }> {
  if (mediaTypeBase(mediaType) === "audio/pcm") {
    const sampleRate = parseMediaTypeParam(mediaType, "rate") ?? 24_000;
    return {
      audio: await wrapPcm16Mono(audio, sampleRate),
      mediaType: "audio/wav",
    };
  }
  return { audio, mediaType };
}

function mediaTypeBase(mediaType: string): string {
  return mediaType.split(";")[0]?.trim().toLowerCase() ?? "";
}

function mediaTypeToExtension(mediaType: string): string {
  switch (mediaTypeBase(mediaType)) {
    case "audio/mpeg":
    case "audio/mp3":
      return "mp3";
    case "audio/wav":
    case "audio/x-wav":
      return "wav";
    case "audio/ogg":
      return "ogg";
    case "audio/opus":
      return "opus";
    case "audio/flac":
      return "flac";
    case "audio/webm":
      return "webm";
    case "audio/mp4":
    case "audio/m4a":
    case "audio/x-m4a":
      return "m4a";
    default:
      return "mp3";
  }
}

export function createOpenAI(config: OpenAISpeechProviderConfig = {}) {
  const ttsProvider = new OpenAISpeechProvider(config);
  const sttProvider = new OpenAISpeechToTextProvider(config);
  const fallbackSTT = config.fallbackSTT;

  const factory = (modelId?: string): ResolvedModel<string> => ({
    provider: ttsProvider,
    modelId: modelId ?? ttsProvider.defaultModel,
    ...(fallbackSTT && { fallbackSTT }),
  });

  return Object.assign(factory, {
    stt: (modelId?: string): ResolvedSTTModel => ({
      provider: sttProvider,
      modelId: modelId ?? sttProvider.defaultModel,
    }),
  });
}
