import { parseMediaTypeParam, wrapPcm16Mono } from "../../audio-utils.js";
import {
  handleErrorResponse,
  resolveApiKey,
  SDK_USER_AGENT,
} from "../../provider-utils.js";
import type {
  ResolvedSTTModel,
  SpeechToTextProvider,
} from "../../speech-to-text-provider.js";
import type { WordTimestamp } from "../../timestamps.js";

export interface OpenAISpeechToTextProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
}

// OpenAI Whisper is advertised as 50+ languages; we list the ISO-639-1 codes
// the API's `language` parameter accepts. Matches the TTS provider's list.
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

/**
 * OpenAI Whisper / gpt-4o-transcribe adapter for the SDK's derived-timestamps
 * path. Uses `/v1/audio/transcriptions` with `timestamp_granularities: ["word"]`
 * and `response_format: "verbose_json"`.
 *
 * Note: `gpt-4o-transcribe-diarize` is intentionally not listed — that
 * variant does not support `timestamp_granularities`.
 */
export class OpenAISpeechToTextProvider implements SpeechToTextProvider {
  readonly id = "openai";
  readonly defaultModel = "whisper-1";

  readonly models = [
    {
      id: "whisper-1",
      releaseDate: "2023-03-01",
      languages: OPENAI_STT_LANGUAGES,
    },
    {
      id: "gpt-4o-transcribe",
      releaseDate: "2025-03-20",
      languages: OPENAI_STT_LANGUAGES,
    },
    {
      id: "gpt-4o-mini-transcribe",
      releaseDate: "2025-03-20",
      languages: OPENAI_STT_LANGUAGES,
    },
  ] as const;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: OpenAISpeechToTextProviderConfig = {}) {
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
    // Cast via BlobPart: TS narrowing of Uint8Array<ArrayBufferLike> vs
    // Blob's required ArrayBuffer-backed view is stricter than runtime.
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

    await handleErrorResponse(response, `openai/${options.modelId}`);

    const data = (await response.json()) as {
      text?: string;
      words?: { word: string; start: number; end: number }[];
    };

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

export function createOpenAISTT(config: OpenAISpeechToTextProviderConfig = {}) {
  const provider = new OpenAISpeechToTextProvider(config);

  return function openaiSTT(modelId?: string): ResolvedSTTModel {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
    };
  };
}

// OpenAI transcription accepts mp3/mp4/mpeg/mpga/m4a/wav/webm/flac/ogg/opus
// but rejects raw PCM. When a TTS provider hands us raw little-endian PCM
// (stitch mode), we wrap it with a WAV header so the STT endpoint will
// parse it. `audio/l16` is intentionally NOT handled: RFC 2586 defines it
// as big-endian and `wrapPcm16Mono` writes little-endian — silently mis-
// wrapping would corrupt audio. No current provider emits L16; add an
// explicit byte-swap branch here if one does.
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
