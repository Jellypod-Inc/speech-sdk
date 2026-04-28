import type { AudioOutput } from "../../audio-output.js";
import { stripAudioTags } from "../../audio-tags.js";
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

export interface FishAudioSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fallbackSTT?: ResolvedSTTModel;
  fetch?: typeof globalThis.fetch;
}

export const FISH_AUDIO_PROVIDER_ID = "fish-audio" as const;

export const FISH_AUDIO_MODELS: readonly ModelInfo[] = [
  {
    id: "s2-pro",
    releaseDate: "2026-03-09",
    languages: ["ja", "en", "zh", "ko", "es", "pt", "ar", "ru", "fr", "de"],
    features: [
      "streaming",
      "audio-tags",
      "open-source",
      "inline-voice-cloning",
    ],
  },
] as const;

export class FishAudioSpeechProvider implements SpeechProvider<string, string> {
  readonly id = FISH_AUDIO_PROVIDER_ID;
  readonly defaultModel = "s2-pro";

  readonly models = FISH_AUDIO_MODELS;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: FishAudioSpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? "https://api.fish.audio";
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  processAudioTags(
    text: string,
    modelId: string
  ): { text: string; warnings: string[] } {
    if (
      this.models.some((m) => m.id === modelId && hasFeature(m, "audio-tags"))
    ) {
      return { text, warnings: [] };
    }
    return stripAudioTags(text, `fish-audio/${modelId}`);
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
    const url = `${this.baseURL}/v1/tts`;

    const body: Record<string, unknown> = {
      ...options.providerOptions,
      text: options.text,
    };

    if (options.voice) {
      body.reference_id = options.voice;
    }

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolveApiKey(this.apiKey, "FISH_AUDIO_API_KEY", "Fish Audio")}`,
        model: options.modelId,
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
    const url = `${this.baseURL}/v1/tts`;

    const body: Record<string, unknown> = {
      ...options.providerOptions,
      text: options.text,
    };
    if (options.voice) {
      body.reference_id = options.voice;
    }

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolveApiKey(this.apiKey, "FISH_AUDIO_API_KEY", "Fish Audio")}`,
        model: options.modelId,
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);

    if (!response.body) {
      throw new Error(`fish-audio/${options.modelId}: response has no body`);
    }

    return {
      stream: response.body,
      mediaType: response.headers.get("content-type") ?? "audio/mpeg",
    };
  }

  getStitchOptions(modelId: string) {
    if (this.models.some((m) => m.id === modelId)) {
      return {
        providerOptions: { format: "wav" },
        mediaType: "audio/wav",
      };
    }
    return;
  }

  resolveOutputFormat(modelId: string, output: AudioOutput) {
    if (!this.models.some((m) => m.id === modelId)) {
      return;
    }
    switch (output.format) {
      case "wav":
        return {
          providerOptions: { format: "wav" },
          expectedMediaType: "audio/wav",
        };
      case "mp3":
        return {
          providerOptions: { format: "mp3" },
          expectedMediaType: "audio/mpeg",
        };
      case "pcm":
        return {
          providerOptions: { format: "wav" },
          expectedMediaType: "audio/wav",
        };
      default:
        return;
    }
  }

  dialogueCapabilities(modelId: string) {
    if (modelId === "s2-pro") {
      return { minVoices: 1, maxVoices: 4 };
    }
    return;
  }

  async generateDialogue(options: {
    modelId: string;
    turns: readonly { voice: string; text: string }[];
    providerOptions?: Record<string, unknown>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<{
    audio: Uint8Array;
    mediaType: string;
    providerMetadata?: Record<string, unknown>;
  }> {
    if (options.modelId !== "s2-pro") {
      throw new Error(
        `fish-audio/${options.modelId} does not support native dialogue; use s2-pro.`
      );
    }

    const voiceToIndex = new Map<string, number>();
    const tagged: string[] = [];
    for (const t of options.turns) {
      let idx = voiceToIndex.get(t.voice);
      if (idx === undefined) {
        idx = voiceToIndex.size;
        voiceToIndex.set(t.voice, idx);
      }
      tagged.push(`<|speaker:${idx}|>${t.text}`);
    }
    const text = tagged.join("\n");
    const referenceIds = Array.from(voiceToIndex.keys());

    const body: Record<string, unknown> = {
      ...options.providerOptions,
      text,
      reference_id: referenceIds,
    };

    const response = await this.fetchFn(`${this.baseURL}/v1/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolveApiKey(this.apiKey, "FISH_AUDIO_API_KEY", "Fish Audio")}`,
        model: options.modelId,
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);

    return {
      audio: new Uint8Array(await response.arrayBuffer()),
      mediaType: response.headers.get("content-type") ?? "audio/mpeg",
    };
  }
}

export function createFishAudio(config: FishAudioSpeechProviderConfig = {}) {
  const provider = new FishAudioSpeechProvider(config);
  const fallbackSTT = config.fallbackSTT;

  return function fishAudio(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
      ...(fallbackSTT && { fallbackSTT }),
    };
  };
}
