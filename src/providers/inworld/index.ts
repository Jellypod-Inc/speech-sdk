import { z } from "zod";
import type { AudioOutput } from "../../audio-output.js";
import { base64ToUint8Array, uint8ArrayToBase64 } from "../../audio-utils.js";
import { defaultCloneLanguage } from "../../clone-voice.js";
import { DEFAULT_PREVIEW_TEXT } from "../../design-voice.js";
import { NoSpeechGeneratedError, SpeechSDKError } from "../../errors.js";
import {
  handleErrorResponse,
  resolveApiKey,
  SDK_USER_AGENT,
} from "../../provider-utils.js";
import {
  type CloneVoiceProviderRequest,
  type CloneVoiceProviderResult,
  type DesignVoiceProviderRequest,
  type DesignVoiceProviderResult,
  type ModelInfo,
  type ResolvedModel,
  resolveSampleRate,
  type SpeechProvider,
} from "../../speech-provider.js";
import type { ResolvedSTTModel } from "../../speech-to-text-provider.js";
import type { WordTimestamp } from "../../timestamps.js";
import {
  inworldWordAlignmentSchema,
  wordAlignmentToWordTimestamps,
} from "./alignment.js";

const ttsResponseSchema = z.object({
  audioContent: z.string().optional(),
  timestampInfo: z
    .object({ wordAlignment: inworldWordAlignmentSchema.optional() })
    .optional(),
});

export interface InworldSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fallbackSTT?: ResolvedSTTModel;
  fetch?: typeof globalThis.fetch;
}

interface InworldAudioConfig {
  audio_encoding?: string;
  sample_rate_hertz?: number;
  [key: string]: unknown;
}

const DEFAULT_AUDIO_ENCODING = "MP3";
const DEFAULT_SAMPLE_RATE_HERTZ = 48_000;

const INWORLD_SAMPLE_RATES = [
  8000, 16_000, 22_050, 24_000, 32_000, 44_100, 48_000,
] as const;

function mediaTypeForEncoding(encoding: string | undefined): string {
  switch ((encoding ?? DEFAULT_AUDIO_ENCODING).toUpperCase()) {
    case "LINEAR16":
      return "audio/wav";
    case "OGG_OPUS":
      return "audio/ogg";
    case "MULAW":
      return "audio/basic";
    case "ALAW":
      return "audio/x-alaw-basic";
    default:
      return "audio/mpeg";
  }
}

export const INWORLD_PROVIDER_ID = "inworld" as const;

// Inworld TTS accepts any BCP-47 language code on input — see
// https://docs.inworld.ai/tts/tts. The arrays below list the *primary
// documented* languages per model for discoverability (e.g. SDK consumers
// rendering language pickers); they are NOT a runtime allowlist. Passing a
// code outside the list — e.g. "fi", "vi", "tr" — works.
const INWORLD_PRIMARY_LANGUAGES = [
  "en",
  "ar",
  "zh",
  "nl",
  "fr",
  "de",
  "he",
  "hi",
  "it",
  "ja",
  "ko",
  "pl",
  "pt",
  "es",
] as const;

// Inworld's clone endpoint wants a locale enum (EN_US), not a raw BCP-47 tag (en).
const INWORLD_LANG_CODE_MAP: Record<string, string> = {
  en: "EN_US",
  es: "ES_ES",
  fr: "FR_FR",
  de: "DE_DE",
  it: "IT_IT",
  pt: "PT_BR",
  ja: "JA_JP",
  ko: "KO_KR",
  nl: "NL_NL",
  pl: "PL_PL",
  zh: "ZH_CN",
  ru: "RU_RU",
  ar: "AR_SA",
  hi: "HI_IN",
  he: "HE_IL",
};

function toInworldLangCode(language: string): string {
  const base = language.toLowerCase().split("-")[0];
  return INWORLD_LANG_CODE_MAP[base] ?? "AUTO";
}

export const INWORLD_MODELS: readonly ModelInfo[] = [
  {
    id: "inworld-tts-1.5-max",
    releaseDate: "2025-08-15",
    languages: INWORLD_PRIMARY_LANGUAGES,
    features: ["streaming", "timestamps", "voice-cloning", "voice-design"],
    maxInputChars: 2000,
  },
  {
    id: "inworld-tts-1.5-mini",
    releaseDate: "2025-08-15",
    languages: INWORLD_PRIMARY_LANGUAGES,
    features: ["streaming", "timestamps", "voice-cloning", "voice-design"],
    maxInputChars: 2000,
  },
  {
    // Realtime TTS-2 — adds `delivery_mode` (STABLE | BALANCED | CREATIVE);
    // `temperature` is a no-op on this model. Both flow through verbatim via
    // providerOptions — no extra plumbing needed in this provider. Supports
    // 100+ BCP-47 languages on input; `languages` below is just the primary
    // documented set.
    id: "inworld-tts-2",
    releaseDate: "2026-05-05",
    languages: INWORLD_PRIMARY_LANGUAGES,
    features: ["streaming", "timestamps", "voice-cloning", "voice-design"],
    maxInputChars: 2000,
  },
] as const;

export class InworldSpeechProvider implements SpeechProvider<string, string> {
  readonly id = INWORLD_PROVIDER_ID;
  readonly defaultModel = "inworld-tts-1.5-max";

  readonly models = INWORLD_MODELS;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: InworldSpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? "https://api.inworld.ai";
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private buildBody(
    text: string,
    modelId: string,
    voice: string | undefined,
    providerOptions: Record<string, unknown> | undefined
  ): { body: Record<string, unknown>; audioConfig: InworldAudioConfig } {
    const opts = (providerOptions ?? {}) as Record<string, unknown>;
    const { audio_config: audioOverrides, ...rest } = opts;

    const audioConfig: InworldAudioConfig = {
      audio_encoding: DEFAULT_AUDIO_ENCODING,
      sample_rate_hertz: DEFAULT_SAMPLE_RATE_HERTZ,
      ...((audioOverrides as InworldAudioConfig | undefined) ?? {}),
    };

    const body: Record<string, unknown> = {
      ...rest,
      text,
      model_id: modelId,
      audio_config: audioConfig,
    };
    if (voice !== undefined) {
      body.voice_id = voice;
    }

    return { body, audioConfig };
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
    audio: string;
    mediaType: string;
    providerMetadata?: Record<string, unknown>;
    timestamps?: WordTimestamp[];
  }> {
    const { body, audioConfig } = this.buildBody(
      options.text,
      options.modelId,
      options.voice,
      options.providerOptions
    );

    if (options.includeTimestamps) {
      body.timestamp_type = "WORD";
    }

    const url = `${this.baseURL}/tts/v1/voice`;

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${resolveApiKey(this.apiKey, "INWORLD_API_KEY", "Inworld")}`,
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

    const json = ttsResponseSchema.parse(await response.json());
    if (!json.audioContent) {
      throw new NoSpeechGeneratedError(
        `inworld/${options.modelId}: response missing audioContent`
      );
    }

    const wordAlignment = json.timestampInfo?.wordAlignment;
    const timestamps =
      options.includeTimestamps && wordAlignment
        ? wordAlignmentToWordTimestamps(wordAlignment)
        : undefined;

    return {
      audio: json.audioContent,
      mediaType: mediaTypeForEncoding(audioConfig.audio_encoding),
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
    const { body, audioConfig } = this.buildBody(
      options.text,
      options.modelId,
      options.voice,
      options.providerOptions
    );

    const url = `${this.baseURL}/tts/v1/voice:stream`;

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${resolveApiKey(this.apiKey, "INWORLD_API_KEY", "Inworld")}`,
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
      throw new Error(`inworld/${options.modelId}: response has no body`);
    }

    return {
      stream: parseInworldNdjsonStream(
        response.body,
        `inworld/${options.modelId}`
      ),
      mediaType: mediaTypeForEncoding(audioConfig.audio_encoding),
    };
  }

  supportedSampleRates(modelId: string): readonly number[] {
    if (!this.models.some((m) => m.id === modelId)) {
      return [];
    }
    return INWORLD_SAMPLE_RATES;
  }

  getStitchOptions(modelId: string, opts?: { sampleRate?: number }) {
    if (!this.models.some((m) => m.id === modelId)) {
      return;
    }
    const rate = resolveSampleRate(
      `inworld/${modelId}`,
      this.supportedSampleRates(modelId),
      opts?.sampleRate
    );
    return {
      providerOptions: {
        audio_config: {
          audio_encoding: "LINEAR16",
          sample_rate_hertz: rate,
        },
      },
      mediaType: "audio/wav",
    };
  }

  resolveOutputFormat(modelId: string, output: AudioOutput) {
    if (!this.models.some((m) => m.id === modelId)) {
      return;
    }
    const rate = resolveSampleRate(
      `inworld/${modelId}`,
      this.supportedSampleRates(modelId),
      output.sampleRate
    );
    switch (output.format) {
      case "wav":
      case "pcm":
        // LINEAR16 returns 16-bit PCM with a WAV header; SDK unwraps for pcm.
        return {
          providerOptions: {
            audio_config: {
              audio_encoding: "LINEAR16",
              sample_rate_hertz: rate,
            },
          },
          expectedMediaType: "audio/wav",
        };
      case "mp3":
        return {
          providerOptions: {
            audio_config: {
              audio_encoding: "MP3",
              sample_rate_hertz: rate,
            },
          },
          expectedMediaType: "audio/mpeg",
        };
      default:
        return;
    }
  }

  maxCloneSamples(): number {
    return 10;
  }

  async cloneVoice(
    options: CloneVoiceProviderRequest
  ): Promise<CloneVoiceProviderResult> {
    const { langCode: langCodeOverride, ...restOpts } =
      options.providerOptions ?? {};
    const warnings: string[] = [];

    let langCode = langCodeOverride;
    if (langCode === undefined) {
      const language = defaultCloneLanguage(
        "inworld",
        options.language,
        warnings
      );
      langCode = toInworldLangCode(language);
      if (langCode === "AUTO") {
        warnings.push(
          `inworld has no locale for language '${language}'; using AUTO so the provider detects it — pass providerOptions.langCode to override.`
        );
      }
    }

    const voiceSamples = options.samples.map((sample) => ({
      audioData: uint8ArrayToBase64(sample.bytes),
    }));

    const body: Record<string, unknown> = {
      ...restOpts,
      displayName: options.name,
      langCode,
      voiceSamples,
    };

    const response = await this.fetchFn(
      `${this.baseURL}/voices/v1/voices:clone`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${resolveApiKey(this.apiKey, "INWORLD_API_KEY", "Inworld")}`,
          "X-User-Agent": SDK_USER_AGENT,
          ...options.headers,
        },
        body: JSON.stringify(body),
        signal: options.abortSignal,
      }
    );

    await handleErrorResponse(response, { provider: this.id });

    const json = (await response.json()) as {
      voice?: { voiceId?: unknown };
    };
    const voiceId = json.voice?.voiceId;
    if (typeof voiceId !== "string") {
      throw new SpeechSDKError("inworld: clone response missing voice.voiceId");
    }

    return {
      voiceId,
      ...(warnings.length > 0 && { warnings }),
      providerMetadata: json as Record<string, unknown>,
    };
  }

  async designVoice(
    options: DesignVoiceProviderRequest
  ): Promise<DesignVoiceProviderResult> {
    const {
      langCode: langCodeOverride,
      voiceDesignConfig,
      ...restOpts
    } = options.providerOptions ?? {};
    const warnings: string[] = [];

    let langCode = langCodeOverride;
    if (langCode === undefined) {
      const language = defaultCloneLanguage(
        "inworld",
        options.language,
        warnings
      );
      langCode = toInworldLangCode(language);
      if (langCode === "AUTO") {
        warnings.push(
          `inworld has no locale for language '${language}'; using AUTO so the provider detects it — pass providerOptions.langCode to override.`
        );
      }
    }

    const authHeader = `Basic ${resolveApiKey(this.apiKey, "INWORLD_API_KEY", "Inworld")}`;

    const designResponse = await this.fetchFn(
      `${this.baseURL}/voices/v1/voices:design`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
          "X-User-Agent": SDK_USER_AGENT,
          ...options.headers,
        },
        body: JSON.stringify({
          ...restOpts,
          langCode,
          designPrompt: options.description,
          previewText: options.previewText ?? DEFAULT_PREVIEW_TEXT,
          voiceDesignConfig: {
            ...(typeof voiceDesignConfig === "object" && voiceDesignConfig
              ? voiceDesignConfig
              : {}),
            // We publish a single previewVoice, so pin the count last — it must win over providerOptions.
            numberOfSamples: 1,
          },
        }),
        signal: options.abortSignal,
      }
    );

    await handleErrorResponse(designResponse, { provider: this.id });

    const designJson = (await designResponse.json()) as {
      previewVoices?: { previewAudio?: unknown; voiceId?: unknown }[];
    };
    const previewVoice = designJson.previewVoices?.[0];
    if (!previewVoice || typeof previewVoice.voiceId !== "string") {
      throw new SpeechSDKError(
        "inworld: voice design response missing previewVoices[].voiceId"
      );
    }
    const previewVoiceId = previewVoice.voiceId;

    const publishResponse = await this.fetchFn(
      `${this.baseURL}/voices/v1/voices/${encodeURIComponent(previewVoiceId)}:publish`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
          "X-User-Agent": SDK_USER_AGENT,
          ...options.headers,
        },
        body: JSON.stringify({ displayName: options.name }),
        signal: options.abortSignal,
      }
    );

    await handleErrorResponse(publishResponse, { provider: this.id });

    const publishJson = (await publishResponse.json()) as {
      voice?: { voiceId?: unknown };
      voiceId?: unknown;
    };
    const voiceId =
      (typeof publishJson.voice?.voiceId === "string"
        ? publishJson.voice.voiceId
        : undefined) ??
      (typeof publishJson.voiceId === "string"
        ? publishJson.voiceId
        : undefined) ??
      previewVoiceId;

    return {
      voiceId,
      ...(typeof previewVoice.previewAudio === "string" && {
        preview: {
          audio: base64ToUint8Array(previewVoice.previewAudio),
          mediaType: "audio/mpeg",
        },
      }),
      ...(warnings.length > 0 && { warnings }),
      providerMetadata: publishJson as Record<string, unknown>,
    };
  }
}

interface InworldNdjsonChunk {
  audioContent?: string;
  error?: { message?: string } | string;
  result?: { audioContent?: string };
}

function extractAudio(line: string): Uint8Array | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const parsed = JSON.parse(trimmed) as InworldNdjsonChunk;
  if (parsed.error != null) {
    const message =
      typeof parsed.error === "string"
        ? parsed.error
        : (parsed.error.message ?? "stream error");
    throw new Error(message);
  }
  const b64 = parsed.audioContent ?? parsed.result?.audioContent;
  if (!b64) {
    return null;
  }
  return base64ToUint8Array(b64);
}

function emitLine(
  line: string,
  controller: ReadableStreamDefaultController<Uint8Array>
): void {
  const audio = extractAudio(line);
  if (audio) {
    controller.enqueue(audio);
  }
}

function drainBuffer(
  state: { buffer: string },
  controller: ReadableStreamDefaultController<Uint8Array>
): void {
  let newlineIndex = state.buffer.indexOf("\n");
  while (newlineIndex !== -1) {
    const line = state.buffer.slice(0, newlineIndex);
    state.buffer = state.buffer.slice(newlineIndex + 1);
    emitLine(line, controller);
    newlineIndex = state.buffer.indexOf("\n");
  }
}

async function pumpStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  controller: ReadableStreamDefaultController<Uint8Array>
): Promise<void> {
  const decoder = new TextDecoder();
  const state = { buffer: "" };

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      state.buffer += decoder.decode();
      const remaining = state.buffer;
      state.buffer = "";
      emitLine(remaining, controller);
      return;
    }
    state.buffer += decoder.decode(value, { stream: true });
    drainBuffer(state, controller);
  }
}

function parseInworldNdjsonStream(
  source: ReadableStream<Uint8Array>,
  model: string
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await pumpStream(reader, controller);
        controller.close();
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error(`${model}: ${String(err)}`);
        // Cancel upstream so the fetch body isn't left locked; swallow cancel errors.
        reader.cancel(error).catch(() => {
          /* noop */
        });
        controller.error(error);
      }
    },
    cancel(reason) {
      // Propagate cancel to upstream fetch so the HTTP connection is released.
      return reader.cancel(reason);
    },
  });
}

export function createInworld(config: InworldSpeechProviderConfig = {}) {
  const provider = new InworldSpeechProvider(config);
  const fallbackSTT = config.fallbackSTT;

  return function inworld(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
      ...(fallbackSTT && { fallbackSTT }),
    };
  };
}
