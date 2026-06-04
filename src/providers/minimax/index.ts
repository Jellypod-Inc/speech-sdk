import { z } from "zod";
import {
  type AudioOutput,
  DEFAULT_MP3_BITRATE_KBPS,
} from "../../audio-output.js";
import { ApiError, SpeechSDKError } from "../../errors.js";
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

export interface MiniMaxSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
  /** MiniMax Group ID. Required by the mainland-China endpoint; appended as a `GroupId` query param when set. */
  groupId?: string;
}

export const MINIMAX_PROVIDER_ID = "minimax" as const;

const DEFAULT_VOICE_ID = "Wise_Woman";
const DEFAULT_FORMAT = "mp3";

const MINIMAX_SAMPLE_RATES = [
  8000, 16_000, 22_050, 24_000, 32_000, 44_100,
] as const;

const MINIMAX_MP3_BITRATES_KBPS = [32, 64, 128, 256] as const;

const MINIMAX_LANGUAGES = [
  "en",
  "zh",
  "ja",
  "ko",
  "es",
  "fr",
  "de",
  "pt",
  "it",
  "ar",
  "ru",
  "tr",
  "nl",
  "id",
  "vi",
  "th",
  "uk",
  "pl",
  "ro",
  "el",
  "cs",
  "fi",
  "hi",
] as const;

export const MINIMAX_MODELS: readonly ModelInfo[] = [
  {
    id: "speech-2.6-hd",
    releaseDate: "2025-11-01",
    languages: MINIMAX_LANGUAGES,
    features: [],
  },
  {
    id: "speech-2.6-turbo",
    releaseDate: "2025-11-01",
    languages: MINIMAX_LANGUAGES,
    features: [],
  },
  {
    id: "speech-02-hd",
    releaseDate: "2025-04-30",
    languages: MINIMAX_LANGUAGES,
    features: [],
  },
  {
    id: "speech-02-turbo",
    releaseDate: "2025-04-30",
    languages: MINIMAX_LANGUAGES,
    features: [],
  },
  {
    id: "speech-01-hd",
    releaseDate: "2024-12-01",
    languages: MINIMAX_LANGUAGES,
    features: [],
  },
  {
    id: "speech-01-turbo",
    releaseDate: "2024-12-01",
    languages: MINIMAX_LANGUAGES,
    features: [],
  },
] as const;

const minimaxResponseSchema = z.object({
  data: z
    .object({
      audio: z.string().optional(),
      status: z.number().optional(),
    })
    .optional(),
  extra_info: z
    .object({
      audio_length: z.number().optional(),
      audio_sample_rate: z.number().optional(),
      audio_size: z.number().optional(),
      bitrate: z.number().optional(),
      audio_format: z.string().optional(),
      audio_channel: z.number().optional(),
      word_count: z.number().optional(),
      usage_characters: z.number().optional(),
    })
    .optional(),
  base_resp: z
    .object({
      status_code: z.number(),
      status_msg: z.string().optional(),
    })
    .optional(),
  trace_id: z.string().optional(),
});

export class MiniMaxSpeechProvider implements SpeechProvider<string, string> {
  readonly id = MINIMAX_PROVIDER_ID;
  readonly defaultModel = "speech-2.6-hd";

  readonly models = MINIMAX_MODELS;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly groupId: string | undefined;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: MiniMaxSpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? "https://api.minimax.io/v1";
    this.groupId = config.groupId;
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
    audioDurationMs?: number;
    mediaType: string;
    providerMetadata?: Record<string, unknown>;
  }> {
    const {
      voice_setting: voiceOpts,
      audio_setting: audioOpts,
      ...rest
    } = options.providerOptions ?? {};

    const voiceSetting: Record<string, unknown> = {
      voice_id: DEFAULT_VOICE_ID,
      ...asRecord(voiceOpts),
    };
    if (options.voice) {
      voiceSetting.voice_id = options.voice;
    }

    const audioSetting: Record<string, unknown> = {
      format: DEFAULT_FORMAT,
      ...asRecord(audioOpts),
    };

    const body: Record<string, unknown> = {
      ...rest,
      model: options.modelId,
      text: options.text,
      stream: false,
      voice_setting: voiceSetting,
      audio_setting: audioSetting,
      output_format: "hex",
    };

    const response = await this.fetchFn(this.endpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolveApiKey(this.apiKey, "MINIMAX_API_KEY", "MiniMax")}`,
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);

    const payload = minimaxResponseSchema.parse(await response.json());

    // MiniMax returns HTTP 200 even for logical failures; the real status lives in base_resp.
    if (payload.base_resp && payload.base_resp.status_code !== 0) {
      const { status_code, status_msg } = payload.base_resp;
      throw new ApiError(
        `MiniMax T2A error ${status_code}: ${status_msg ?? "unknown error"}`,
        {
          statusCode: minimaxHttpStatus(status_code),
          code: String(status_code),
        }
      );
    }

    const hexAudio = payload.data?.audio;
    if (!hexAudio) {
      throw new SpeechSDKError(
        `minimax/${options.modelId}: response contained no audio data`
      );
    }

    const format =
      payload.extra_info?.audio_format ?? String(audioSetting.format);
    const sampleRate =
      payload.extra_info?.audio_sample_rate ??
      (typeof audioSetting.sample_rate === "number"
        ? audioSetting.sample_rate
        : undefined);

    return {
      audio: hexToUint8Array(hexAudio),
      mediaType: minimaxMediaType(
        `minimax/${options.modelId}`,
        format,
        sampleRate
      ),
      ...(payload.extra_info?.audio_length != null && {
        audioDurationMs: payload.extra_info.audio_length,
      }),
      ...(payload.extra_info && { providerMetadata: payload.extra_info }),
    };
  }

  supportedSampleRates(modelId: string): readonly number[] {
    if (!this.models.some((m) => m.id === modelId)) {
      return [];
    }
    return MINIMAX_SAMPLE_RATES;
  }

  getStitchOptions(modelId: string, opts?: { sampleRate?: number }) {
    if (!this.models.some((m) => m.id === modelId)) {
      return;
    }
    const rate = resolveSampleRate(
      `minimax/${modelId}`,
      this.supportedSampleRates(modelId),
      opts?.sampleRate
    );
    return {
      providerOptions: {
        audio_setting: { format: "pcm", sample_rate: rate, channel: 1 },
      },
      mediaType: `audio/pcm;rate=${rate}`,
    };
  }

  resolveOutputFormat(modelId: string, output: AudioOutput) {
    if (!this.models.some((m) => m.id === modelId)) {
      return;
    }
    const rate = resolveSampleRate(
      `minimax/${modelId}`,
      this.supportedSampleRates(modelId),
      output.sampleRate
    );
    switch (output.format) {
      // MiniMax emits raw s16le PCM via format=pcm; the SDK wraps it to WAV when wav is requested.
      case "wav":
      case "pcm":
        return {
          providerOptions: {
            audio_setting: { format: "pcm", sample_rate: rate, channel: 1 },
          },
          expectedMediaType: `audio/pcm;rate=${rate}`,
        };
      case "mp3": {
        const bitrateKbps = output.bitrate ?? DEFAULT_MP3_BITRATE_KBPS;
        const closestKbps = MINIMAX_MP3_BITRATES_KBPS.reduce((prev, curr) =>
          Math.abs(curr - bitrateKbps) < Math.abs(prev - bitrateKbps)
            ? curr
            : prev
        );
        return {
          providerOptions: {
            audio_setting: {
              format: "mp3",
              sample_rate: rate,
              bitrate: closestKbps * 1000,
            },
          },
          expectedMediaType: "audio/mpeg",
        };
      }
      default:
        return;
    }
  }

  private endpoint(): string {
    const url = `${this.baseURL}/t2a_v2`;
    const groupId =
      this.groupId ??
      (typeof process === "undefined"
        ? undefined
        : process.env?.MINIMAX_GROUP_ID);
    return groupId ? `${url}?GroupId=${encodeURIComponent(groupId)}` : url;
  }
}

export function createMiniMax(config: MiniMaxSpeechProviderConfig = {}) {
  const provider = new MiniMaxSpeechProvider(config);
  return function minimax(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
    };
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function minimaxMediaType(
  modelLabel: string,
  format: string,
  sampleRate: number | undefined
): string {
  switch (format.toLowerCase()) {
    case "pcm":
      if (sampleRate == null) {
        throw new SpeechSDKError(
          `${modelLabel}: raw PCM output requires a known sample rate (set audio_setting.sample_rate)`
        );
      }
      return `audio/pcm;rate=${sampleRate}`;
    case "wav":
    case "pcmu_wav":
      return "audio/wav";
    case "flac":
      return "audio/flac";
    case "opus":
      return "audio/opus";
    default:
      return "audio/mpeg";
  }
}

// MiniMax tunnels logical errors through base_resp; map the common codes onto HTTP
// status so p-retry treats rate limits (1002) as retriable and auth/quota as terminal.
function minimaxHttpStatus(code: number): number {
  switch (code) {
    case 1002:
      return 429;
    case 1004:
    case 1039:
      return 401;
    case 1008:
      return 402;
    default:
      return 400;
  }
}

function hexToUint8Array(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new SpeechSDKError(
      "minimax: hex audio payload has an odd character count"
    );
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) {
      throw new SpeechSDKError(
        "minimax: hex audio payload contains non-hex characters"
      );
    }
    out[i] = byte;
  }
  return out;
}
