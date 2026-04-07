import { detectAudioTags, stripAudioTags } from "../../audio-tags.js";
import { handleErrorResponse, resolveApiKey } from "../../provider-utils.js";
import type { ResolvedModel, SpeechProvider } from "../../speech-provider.js";

export interface CartesiaSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
}

export class CartesiaSpeechProvider implements SpeechProvider<string, string> {
  readonly id = "cartesia";
  readonly defaultModel = "sonic-3";

  readonly models = [
    {
      id: "sonic-3",
      audioTags: true,
      languages: [
        "en",
        "fr",
        "de",
        "es",
        "pt",
        "zh",
        "ja",
        "hi",
        "it",
        "ko",
        "nl",
        "pl",
        "ru",
        "sv",
        "tr",
        "tl",
        "bg",
        "ro",
        "ar",
        "cs",
        "el",
        "fi",
        "hr",
        "ms",
        "sk",
        "da",
        "ta",
        "uk",
        "hu",
        "no",
        "vi",
        "bn",
        "th",
        "he",
        "ka",
        "id",
        "te",
        "gu",
        "kn",
        "ml",
        "mr",
        "pa",
      ],
      releaseDate: "2025-10-27",
      openSource: false,
      inlineVoiceCloning: true,
      streaming: true,
    },
    {
      id: "sonic-2",
      audioTags: false,
      languages: ["en"],
      releaseDate: "2025-03-13",
      openSource: false,
      inlineVoiceCloning: false,
      streaming: true,
    },
  ] as const;

  private static readonly PASSTHROUGH_TAGS = ["laughter"] as const;

  private static readonly EMOTIONS = [
    "neutral",
    "angry",
    "excited",
    "content",
    "sad",
    "scared",
    "happy",
    "euphoric",
    "anxious",
    "panicked",
    "calm",
    "confident",
    "curious",
    "frustrated",
    "sarcastic",
    "melancholic",
    "surprised",
    "disgusted",
    "contemplative",
    "determined",
    "proud",
    "distant",
    "skeptical",
    "mysterious",
    "anticipation",
    "grateful",
    "affectionate",
    "sympathetic",
    "nostalgic",
    "wistful",
    "apologetic",
    "hesitant",
    "insecure",
    "confused",
    "resigned",
    "alarmed",
    "bored",
    "tired",
    "rejected",
    "hurt",
    "disappointed",
    "dejected",
    "guilty",
    "envious",
    "contempt",
    "threatened",
    "agitated",
    "outraged",
    "mad",
    "triumphant",
    "amazed",
    "flirtatious",
    "joking/comedic",
    "serene",
    "peaceful",
    "enthusiastic",
    "elated",
    "trust",
  ] as const;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: CartesiaSpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? "https://api.cartesia.ai";
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  processAudioTags(
    text: string,
    modelId: string
  ): { text: string; warnings: string[] } {
    if (!this.models.some((m) => m.id === modelId && m.audioTags)) {
      return stripAudioTags(text, `cartesia/${modelId}`);
    }

    const tags = detectAudioTags(text);
    if (tags.length === 0) {
      return { text, warnings: [] };
    }

    const warnings: string[] = [];
    let processed = text;

    for (const tag of tags) {
      const inner = tag.slice(1, -1).toLowerCase();

      if (
        (CartesiaSpeechProvider.PASSTHROUGH_TAGS as readonly string[]).includes(
          inner
        )
      ) {
        continue;
      }

      if (
        (CartesiaSpeechProvider.EMOTIONS as readonly string[]).includes(inner)
      ) {
        processed = processed.replace(tag, `<emotion value="${inner}"/>`);
        continue;
      }

      warnings.push(
        `Audio tag ${tag} is not supported by cartesia/${modelId} and was removed.`
      );
      processed = processed.replace(tag, "");
    }

    processed = processed.replace(/\s+/g, " ").trim();
    return { text: processed, warnings };
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
    const url = `${this.baseURL}/tts/bytes`;

    const body: Record<string, unknown> = {
      output_format: {
        container: "wav",
        encoding: "pcm_f32le",
        sample_rate: 44_100,
      },
      ...options.providerOptions,
      model_id: options.modelId,
      transcript: options.text,
      voice: { mode: "id", id: options.voice },
    };

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": resolveApiKey(this.apiKey, "CARTESIA_API_KEY", "Cartesia"),
        "Cartesia-Version": "2025-04-16",
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `cartesia/${options.modelId}`);

    const arrayBuffer = await response.arrayBuffer();
    const mediaType = response.headers.get("content-type") ?? "audio/wav";

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
    const url = `${this.baseURL}/tts/bytes`;

    const body: Record<string, unknown> = {
      output_format: {
        container: "wav",
        encoding: "pcm_f32le",
        sample_rate: 44_100,
      },
      ...options.providerOptions,
      model_id: options.modelId,
      transcript: options.text,
      voice: { mode: "id", id: options.voice },
    };

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": resolveApiKey(this.apiKey, "CARTESIA_API_KEY", "Cartesia"),
        "Cartesia-Version": "2025-04-16",
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `cartesia/${options.modelId}`);

    if (!response.body) {
      throw new Error(`cartesia/${options.modelId}: response has no body`);
    }

    return {
      stream: response.body,
      mediaType: response.headers.get("content-type") ?? "audio/wav",
    };
  }
}

export function createCartesia(config: CartesiaSpeechProviderConfig = {}) {
  const provider = new CartesiaSpeechProvider(config);

  return function cartesia(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
    };
  };
}
