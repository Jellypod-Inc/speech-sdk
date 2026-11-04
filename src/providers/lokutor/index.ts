import type { AudioOutput } from "../../audio-output.js";
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

export interface LokutorSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
}

export const LOKUTOR_PROVIDER_ID = "lokutor" as const;
const TRAILING_SLASH = /\/$/;

export const LOKUTOR_MODELS: readonly ModelInfo[] = [
  {
    id: "versa-2.0",
    releaseDate: "2026-09-20",
    languages: ["en", "es", "ca", "eu", "gl", "pt", "it", "fr", "de"],
    features: [],
    maxInputChars: 5000,
  },
] as const;

export class LokutorSpeechProvider implements SpeechProvider<string, string> {
  readonly id = LOKUTOR_PROVIDER_ID;
  readonly defaultModel = "versa-2.0";
  readonly models = LOKUTOR_MODELS;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: LokutorSpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = (config.baseURL ?? "https://api.lokutor.com").replace(
      TRAILING_SLASH,
      ""
    );
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async generate(options: {
    modelId: string;
    text: string;
    voice?: string;
    providerOptions?: Record<string, unknown>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<{ audio: Uint8Array; mediaType: string }> {
    if (options.modelId !== this.defaultModel) {
      throw new Error(`lokutor: unknown model "${options.modelId}"`);
    }
    if (!options.text.trim() || options.text.length > 5000) {
      throw new Error("lokutor: text must contain 1 to 5000 characters");
    }
    const voice = options.voice ?? "F1";
    if (!voice.trim()) {
      throw new Error("lokutor: voice must not be empty");
    }
    const {
      language = "en",
      steps = 6,
      ...otherOptions
    } = options.providerOptions ?? {};
    if (Object.keys(otherOptions).length > 0) {
      throw new Error(
        `lokutor: unsupported provider options: ${Object.keys(otherOptions).join(", ")}`
      );
    }
    if (
      typeof language !== "string" ||
      !this.models[0].languages.includes(language)
    ) {
      throw new Error("lokutor: language must be a supported language code");
    }
    if (!Number.isInteger(steps) || Number(steps) < 1 || Number(steps) > 8) {
      throw new Error("lokutor: steps must be an integer from 1 to 8");
    }
    const response = await this.fetchFn(`${this.baseURL}/tts/synthesize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resolveApiKey(this.apiKey, "LOKUTOR_API_KEY", "Lokutor")}`,
        "Content-Type": "application/json",
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify({
        text: options.text,
        voice,
        language,
        steps,
      }),
      signal: options.abortSignal,
    });
    await handleErrorResponse(response, {
      provider: this.id,
      model: options.modelId,
      stage: "synthesis",
    });
    return {
      audio: new Uint8Array(await response.arrayBuffer()),
      mediaType: "audio/wav",
    };
  }

  supportedSampleRates(modelId: string): readonly number[] {
    return modelId === this.defaultModel ? [44_100] : [];
  }

  getStitchOptions(modelId: string, opts?: { sampleRate?: number }) {
    if (modelId !== this.defaultModel) {
      return;
    }
    resolveSampleRate(
      `lokutor/${modelId}`,
      this.supportedSampleRates(modelId),
      opts?.sampleRate
    );
    return { providerOptions: {}, mediaType: "audio/wav" };
  }

  resolveOutputFormat(modelId: string, output: AudioOutput) {
    if (modelId !== this.defaultModel) {
      return;
    }
    resolveSampleRate(
      `lokutor/${modelId}`,
      this.supportedSampleRates(modelId),
      output.sampleRate
    );
    return { providerOptions: {}, expectedMediaType: "audio/wav" };
  }
}

export function createLokutor(config: LokutorSpeechProviderConfig = {}) {
  const provider = new LokutorSpeechProvider(config);
  return function lokutor(modelId?: string): ResolvedModel<string> {
    return { provider, modelId: modelId ?? provider.defaultModel };
  };
}
