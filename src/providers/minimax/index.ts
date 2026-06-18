import { z } from "zod";
import {
  type AudioOutput,
  DEFAULT_MP3_BITRATE_KBPS,
} from "../../audio-output.js";
import { cloneSampleFilename } from "../../clone-voice.js";
import {
  ApiError,
  InvalidCloneFieldError,
  SpeechSDKError,
} from "../../errors.js";
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

const MINIMAX_VOICE_ID_RE = /^[A-Za-z][A-Za-z0-9_-]{6,254}[A-Za-z0-9]$/;

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
    id: "speech-2.8-hd",
    releaseDate: "2026-05-01",
    languages: MINIMAX_LANGUAGES,
    features: ["voice-cloning"],
    maxInputChars: 3000,
  },
  {
    id: "speech-2.8-turbo",
    releaseDate: "2026-05-01",
    languages: MINIMAX_LANGUAGES,
    features: ["voice-cloning"],
    maxInputChars: 3000,
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
  readonly defaultModel = "speech-2.8-hd";

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
    return this.endpointFor("t2a_v2");
  }

  private endpointFor(path: string): string {
    const url = `${this.baseURL}/${path}`;
    const groupId =
      this.groupId ??
      (typeof process === "undefined"
        ? undefined
        : process.env?.MINIMAX_GROUP_ID);
    return groupId ? `${url}?GroupId=${encodeURIComponent(groupId)}` : url;
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
    if (!MINIMAX_VOICE_ID_RE.test(options.name)) {
      throw new InvalidCloneFieldError(
        "minimax",
        "name",
        "MiniMax voice IDs must be 8–256 characters, start with a letter, use only letters/digits/-/_, and not end in - or _."
      );
    }

    const authHeader = `Bearer ${resolveApiKey(this.apiKey, "MINIMAX_API_KEY", "MiniMax")}`;

    const fileId = await this.uploadCloneSample(
      options.samples[0],
      authHeader,
      options
    );

    const cloneBody: Record<string, unknown> = {
      ...options.providerOptions,
      file_id: fileId,
      voice_id: options.name,
    };

    const response = await this.fetchFn(this.endpointFor("voice_clone"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(cloneBody),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);

    const json = (await response.json()) as {
      base_resp?: { status_code?: number; status_msg?: string };
    };
    this.assertOk(json.base_resp, options.modelId);

    return {
      voiceId: options.name,
      providerMetadata: json as Record<string, unknown>,
    };
  }

  private async uploadCloneSample(
    sample: NormalizedSample,
    authHeader: string,
    options: {
      modelId: string;
      abortSignal?: AbortSignal;
      headers?: Record<string, string>;
    }
  ): Promise<string> {
    const form = new FormData();
    form.append("purpose", "voice_clone");
    form.append(
      "file",
      new Blob([sample.bytes as BlobPart], { type: sample.mediaType }),
      cloneSampleFilename(sample, 0)
    );

    const response = await this.fetchFn(this.endpointFor("files/upload"), {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: form,
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);

    const json = (await response.json()) as {
      file?: { file_id?: unknown };
      base_resp?: { status_code?: number; status_msg?: string };
    };
    this.assertOk(json.base_resp, options.modelId);

    const fileId = json.file?.file_id;
    if (typeof fileId !== "string" && typeof fileId !== "number") {
      throw new SpeechSDKError(
        `minimax/${options.modelId}: upload response missing file.file_id`
      );
    }
    return String(fileId);
  }

  private assertOk(
    baseResp: { status_code?: number; status_msg?: string } | undefined,
    modelId: string
  ): void {
    if (
      baseResp &&
      baseResp.status_code !== 0 &&
      baseResp.status_code != null
    ) {
      throw new ApiError(
        `MiniMax error ${baseResp.status_code}: ${baseResp.status_msg ?? "unknown error"} (minimax/${modelId})`,
        {
          statusCode: minimaxHttpStatus(baseResp.status_code),
          code: String(baseResp.status_code),
        }
      );
    }
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
// status so p-retry retries throttling (1002 RPM, 1039 TPM) and treats auth/quota as terminal.
function minimaxHttpStatus(code: number): number {
  switch (code) {
    case 1002:
    case 1039:
      return 429;
    case 1004:
      return 401;
    case 1008:
      return 402;
    default:
      return 400;
  }
}

const HEX_PAYLOAD_RE = /^[0-9a-fA-F]*$/;

function hexToUint8Array(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new SpeechSDKError(
      "minimax: hex audio payload has an odd character count"
    );
  }
  // parseInt is lenient (e.g. "5g" → 5), so validate the whole string up front.
  if (!HEX_PAYLOAD_RE.test(hex)) {
    throw new SpeechSDKError(
      "minimax: hex audio payload contains non-hex characters"
    );
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
