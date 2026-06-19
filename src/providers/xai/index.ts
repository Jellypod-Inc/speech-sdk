import type { AudioOutput } from "../../audio-output.js";
import {
  appendProviderOption,
  appendSampleBlob,
  defaultCloneLanguage,
} from "../../clone-voice.js";
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

export interface XaiSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fallbackSTT?: ResolvedSTTModel;
  fetch?: typeof globalThis.fetch;
}

export const XAI_PROVIDER_ID = "xai" as const;

const XAI_SAMPLE_RATES = [
  8000, 16_000, 22_050, 24_000, 44_100, 48_000,
] as const;

// ISO 639-1 codes; xAI also accepts BCP-47 (e.g. pt-BR) and "auto" via providerOptions.language.
const XAI_LANGUAGES = [
  "en",
  "ar",
  "bn",
  "zh",
  "fr",
  "de",
  "hi",
  "id",
  "it",
  "ja",
  "ko",
  "pt",
  "ru",
  "es",
  "tr",
  "vi",
] as const;

export const XAI_MODELS: readonly ModelInfo[] = [
  {
    id: "grok-tts",
    releaseDate: "2025-11-01",
    languages: XAI_LANGUAGES,
    features: ["streaming", "audio-tags", "voice-cloning"],
    maxInputChars: 15_000,
  },
] as const;

export class XaiSpeechProvider implements SpeechProvider<string, string> {
  readonly id = XAI_PROVIDER_ID;
  readonly defaultModel = "grok-tts";

  readonly models = XAI_MODELS;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: XaiSpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? "https://api.x.ai/v1";
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  // xAI natively supports bracket and angle-bracket audio tags, so passthrough is safe.
  processAudioTags(text: string): { text: string; warnings: string[] } {
    return { text, warnings: [] };
  }

  private buildBody(options: {
    text: string;
    voice?: string;
    providerOptions?: Record<string, unknown>;
  }): Record<string, unknown> {
    // `language` is required by xAI; default to "auto" so detection runs unless caller overrides.
    const body: Record<string, unknown> = {
      language: "auto",
      ...options.providerOptions,
      text: options.text,
    };
    if (options.voice != null) {
      body.voice_id = options.voice;
    }
    return body;
  }

  private mediaTypeForBody(body: Record<string, unknown>): string {
    const output = body.output_format as
      | { codec?: unknown; sample_rate?: unknown }
      | undefined;
    const codec = output?.codec;
    if (codec === "wav") {
      return "audio/wav";
    }
    if (codec === "pcm") {
      const rate =
        typeof output?.sample_rate === "number" ? output.sample_rate : null;
      return rate == null ? "audio/pcm" : `audio/pcm;rate=${rate}`;
    }
    if (codec === "mulaw") {
      return "audio/basic";
    }
    if (codec === "alaw") {
      return "audio/alaw";
    }
    return "audio/mpeg";
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
  }> {
    const body = this.buildBody(options);
    const response = await this.fetchFn(`${this.baseURL}/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolveApiKey(this.apiKey, "XAI_API_KEY", "xAI")}`,
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);

    const arrayBuffer = await response.arrayBuffer();
    // xAI returns bare "audio/pcm" without rate for pcm codec; derive from the requested body so the rate is always present.
    const mediaType = this.mediaTypeForBody(body);

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
  }> {
    const body = this.buildBody(options);
    const response = await this.fetchFn(`${this.baseURL}/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolveApiKey(this.apiKey, "XAI_API_KEY", "xAI")}`,
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);

    if (!response.body) {
      throw new Error(`xai/${options.modelId}: response has no body`);
    }

    return {
      stream: response.body,
      mediaType: this.mediaTypeForBody(body),
    };
  }

  supportedSampleRates(modelId: string): readonly number[] {
    if (!this.models.some((m) => m.id === modelId)) {
      return [];
    }
    return XAI_SAMPLE_RATES;
  }

  getStitchOptions(modelId: string, opts?: { sampleRate?: number }) {
    if (!this.models.some((m) => m.id === modelId)) {
      return;
    }
    const rate = resolveSampleRate(
      `xai/${modelId}`,
      this.supportedSampleRates(modelId),
      opts?.sampleRate
    );
    return {
      providerOptions: { output_format: { codec: "wav", sample_rate: rate } },
      mediaType: "audio/wav",
    };
  }

  async cloneVoice(
    options: CloneVoiceProviderRequest
  ): Promise<CloneVoiceProviderResult> {
    const warnings: string[] = [];
    const language = defaultCloneLanguage("xai", options.language, warnings);

    const form = new FormData();
    form.append("name", options.name);
    form.append("language", language);
    const sample = options.samples[0];
    appendSampleBlob(form, "file", sample, 0);

    for (const [key, value] of Object.entries(options.providerOptions ?? {})) {
      appendProviderOption(form, key, value);
    }

    const response = await this.fetchFn(`${this.baseURL}/custom-voices`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resolveApiKey(this.apiKey, "XAI_API_KEY", "xAI")}`,
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: form,
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);

    const json = (await response.json()) as Record<string, unknown>;
    const voiceId = json.voice_id;
    if (typeof voiceId !== "string") {
      throw new SpeechSDKError("xai: clone response missing voice_id");
    }
    return {
      voiceId,
      ...(warnings.length ? { warnings } : {}),
      providerMetadata: json,
    };
  }

  resolveOutputFormat(modelId: string, output: AudioOutput) {
    if (!this.models.some((m) => m.id === modelId)) {
      return;
    }
    switch (output.format) {
      case "wav": {
        const rate = resolveSampleRate(
          `xai/${modelId}`,
          this.supportedSampleRates(modelId),
          output.sampleRate
        );
        return {
          providerOptions: {
            output_format: { codec: "wav", sample_rate: rate },
          },
          expectedMediaType: "audio/wav",
        };
      }
      case "mp3":
        return {
          providerOptions: { output_format: { codec: "mp3" } },
          expectedMediaType: "audio/mpeg",
        };
      case "pcm": {
        const rate = resolveSampleRate(
          `xai/${modelId}`,
          this.supportedSampleRates(modelId),
          output.sampleRate
        );
        return {
          providerOptions: {
            output_format: { codec: "pcm", sample_rate: rate },
          },
          expectedMediaType: `audio/pcm;rate=${rate}`,
        };
      }
      default:
        return;
    }
  }
}

export function createXai(config: XaiSpeechProviderConfig = {}) {
  const provider = new XaiSpeechProvider(config);
  const fallbackSTT = config.fallbackSTT;
  return function xai(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
      ...(fallbackSTT && { fallbackSTT }),
    };
  };
}
