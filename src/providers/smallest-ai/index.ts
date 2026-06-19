import type { AudioOutput } from "../../audio-output.js";
import { appendProviderOption, appendSampleBlob } from "../../clone-voice.js";
import { SpeechSDKError } from "../../errors.js";
import {
  handleErrorResponse,
  resolveApiKey,
  SDK_USER_AGENT,
} from "../../provider-utils.js";
import {
  type CloneVoiceProviderRequest,
  type CloneVoiceProviderResult,
  type ResolvedModel,
  resolveSampleRate,
  type SpeechProvider,
} from "../../speech-provider.js";

const SMALLEST_CLONE_URL =
  "https://waves-api.smallest.ai/api/v1/lightning-large/add_voice";

export interface SmallestAISpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
}

export class SmallestAISpeechProvider
  implements SpeechProvider<string, string>
{
  readonly id = "smallest-ai";
  readonly defaultModel = "lightning_v3.1";

  readonly models = [
    {
      id: "lightning_v3.1",
      releaseDate: "2025-01-01",
      languages: [
        "en",
        "hi",
        "es",
        "ta",
        "kn",
        "te",
        "ml",
        "mr",
        "gu",
        "fr",
        "it",
        "nl",
        "sv",
        "pt",
        "de",
      ] as const,
      features: ["voice-cloning"],
    },
    {
      id: "lightning_v3.1_pro",
      releaseDate: "2025-05-01",
      languages: ["en", "hi"] as const,
      features: ["voice-cloning"],
    },
  ] as const;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: SmallestAISpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? "https://api.smallest.ai/waves/v1";
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
    mediaType: string;
  }> {
    const outputFormat =
      (options.providerOptions?.output_format as string | undefined) ?? "wav";

    const isProModel = options.modelId === "lightning_v3.1_pro";

    const body: Record<string, unknown> = {
      voice_id: options.voice ?? (isProModel ? "meher" : "magnus"),
      language: "auto",
      ...options.providerOptions,
      text: options.text,
      output_format: outputFormat,
      model: options.modelId,
    };

    const url = `${this.baseURL}/tts`;

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolveApiKey(this.apiKey, "SMALLEST_API_KEY", "Smallest AI")}`,
        "X-User-Agent": SDK_USER_AGENT,
        "X-Source": "jellypod-speech-sdk",
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);

    const arrayBuffer = await response.arrayBuffer();
    const mediaType =
      response.headers.get("content-type") ??
      smallestAIMediaType(outputFormat, body.sample_rate);

    return {
      audio: new Uint8Array(arrayBuffer),
      mediaType,
    };
  }

  async cloneVoice(
    options: CloneVoiceProviderRequest
  ): Promise<CloneVoiceProviderResult> {
    const form = new FormData();
    form.append("displayName", options.name);
    for (const [key, value] of Object.entries(options.providerOptions ?? {})) {
      appendProviderOption(form, key, value);
    }
    const sample = options.samples[0];
    appendSampleBlob(form, "file", sample, 0);

    const response = await this.fetchFn(SMALLEST_CLONE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resolveApiKey(this.apiKey, "SMALLEST_API_KEY", "Smallest AI")}`,
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: form,
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);

    const json = (await response.json()) as {
      voiceId?: unknown;
      data?: { voiceId?: unknown };
    };
    const voiceId = json.voiceId ?? json.data?.voiceId;
    if (typeof voiceId !== "string") {
      throw new SpeechSDKError("smallest-ai: clone response missing voiceId");
    }

    return {
      voiceId,
      providerMetadata: json as Record<string, unknown>,
    };
  }

  supportedSampleRates(modelId: string): readonly number[] {
    if (!this.models.some((m) => m.id === modelId)) {
      return [];
    }
    // Smallest AI Lightning docs do not enumerate sample rates; fall back to the SDK's existing hardcoded rate.
    return [24_000];
  }

  getStitchOptions(modelId: string, opts?: { sampleRate?: number }) {
    if (!this.models.some((m) => m.id === modelId)) {
      return;
    }
    resolveSampleRate(
      `smallest-ai/${modelId}`,
      this.supportedSampleRates(modelId),
      opts?.sampleRate
    );
    return {
      providerOptions: { output_format: "wav" },
      mediaType: "audio/wav",
    };
  }

  resolveOutputFormat(modelId: string, output: AudioOutput) {
    if (!this.models.some((m) => m.id === modelId)) {
      return;
    }
    resolveSampleRate(
      `smallest-ai/${modelId}`,
      this.supportedSampleRates(modelId),
      output.sampleRate
    );
    switch (output.format) {
      case "wav":
        return {
          providerOptions: { output_format: "wav", sample_rate: 24_000 },
          expectedMediaType: "audio/wav",
        };
      case "mp3":
        return {
          providerOptions: { output_format: "mp3", sample_rate: 24_000 },
          expectedMediaType: "audio/mpeg",
        };
      case "pcm":
        return {
          providerOptions: { output_format: "pcm", sample_rate: 24_000 },
          expectedMediaType: "audio/pcm;rate=24000",
        };
      default:
        return;
    }
  }
}

function smallestAIMediaType(format: unknown, sampleRate: unknown): string {
  const rate = typeof sampleRate === "number" ? sampleRate : 24_000;
  switch (typeof format === "string" ? format.toLowerCase() : "wav") {
    case "mp3":
      return "audio/mpeg";
    case "pcm":
      return `audio/pcm;rate=${rate}`;
    case "mulaw":
      return "audio/basic";
    default:
      return "audio/wav";
  }
}

export function createSmallestAI(config: SmallestAISpeechProviderConfig = {}) {
  const provider = new SmallestAISpeechProvider(config);
  return function smallestAI(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
    };
  };
}
