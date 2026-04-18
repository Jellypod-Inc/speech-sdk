import { stripAudioTags } from "../../audio-tags.js";
import { handleErrorResponse, resolveApiKey } from "../../provider-utils.js";
import {
  hasFeature,
  type ResolvedModel,
  type SpeechProvider,
} from "../../speech-provider.js";

export interface FishAudioSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
}

export class FishAudioSpeechProvider implements SpeechProvider<string, string> {
  readonly id = "fish-audio";
  readonly defaultModel = "s2-pro";

  readonly models = [
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
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `fish-audio/${options.modelId}`);

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
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `fish-audio/${options.modelId}`);

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
    return undefined;
  }

  dialogueCapabilities(modelId: string) {
    if (modelId === "s2-pro") {
      return { minVoices: 1, maxVoices: 4 };
    }
    return undefined;
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
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `fish-audio/${options.modelId}`);

    return {
      audio: new Uint8Array(await response.arrayBuffer()),
      mediaType: response.headers.get("content-type") ?? "audio/mpeg",
    };
  }
}

export function createFishAudio(config: FishAudioSpeechProviderConfig = {}) {
  const provider = new FishAudioSpeechProvider(config);

  return function fishAudio(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
    };
  };
}
