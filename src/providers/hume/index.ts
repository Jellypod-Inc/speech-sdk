import { handleErrorResponse, resolveApiKey } from "../../provider-utils.js";
import type { ResolvedModel, SpeechProvider } from "../../speech-provider.js";

export interface HumeSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
}

export class HumeSpeechProvider implements SpeechProvider<string, string> {
  readonly id = "hume";
  readonly defaultModel = "octave-2";

  readonly models = [
    {
      id: "octave-2",
      releaseDate: "2025-10-01",
      languages: [
        "en",
        "fr",
        "de",
        "es",
        "pt",
        "ja",
        "ko",
        "hi",
        "it",
        "ar",
        "ru",
      ] as const,
      features: ["streaming", "inline-voice-cloning"],
    },
    {
      id: "octave-1",
      releaseDate: "2025-03-01",
      languages: ["en"] as const,
      features: ["streaming"],
    },
  ] as const;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: HumeSpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? "https://api.hume.ai/v0";
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private resolveVersion(modelId: string): string | undefined {
    if (modelId === "octave-2") {
      return "2";
    }
    if (modelId === "octave-1") {
      return "1";
    }
    return undefined;
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
    const utterance: Record<string, unknown> = { text: options.text };
    if (options.voice) {
      utterance.voice = { name: options.voice, provider: "HUME_AI" };
    }

    const version = this.resolveVersion(options.modelId);

    const body: Record<string, unknown> = {
      ...options.providerOptions,
      utterances: [utterance],
    };

    if (version != null) {
      body.version = version;
    }

    const url = `${this.baseURL}/tts/file`;

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hume-Api-Key": resolveApiKey(this.apiKey, "HUME_API_KEY", "Hume"),
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `hume/${options.modelId}`);

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
    const utterance: Record<string, unknown> = { text: options.text };
    if (options.voice) {
      utterance.voice = { name: options.voice, provider: "HUME_AI" };
    }

    const version = this.resolveVersion(options.modelId);

    const body: Record<string, unknown> = {
      ...options.providerOptions,
      utterances: [utterance],
    };
    if (version != null) {
      body.version = version;
    }

    const url = `${this.baseURL}/tts/stream/file`;

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hume-Api-Key": resolveApiKey(this.apiKey, "HUME_API_KEY", "Hume"),
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `hume/${options.modelId}`);

    if (!response.body) {
      throw new Error(`hume/${options.modelId}: response has no body`);
    }

    return {
      stream: response.body,
      mediaType: response.headers.get("content-type") ?? "audio/mpeg",
    };
  }

  getStitchOptions(modelId: string) {
    if (this.models.some((m) => m.id === modelId)) {
      // Hume Octave always returns 48 kHz mono s16 PCM. The /v0/tts/file
      // API only accepts { type: "mp3" | "wav" | "pcm" } — there is no
      // sample-rate option (verified against the Hume TS SDK's FormatPcm
      // type and Hume's own 48 kHz "professional audio" claim). The
      // response content-type omits the rate, so we declare it here for
      // the stitch decoder.
      return {
        providerOptions: { format: { type: "pcm" } },
        mediaType: "audio/pcm;rate=48000",
      };
    }
    return undefined;
  }

  dialogueCapabilities(modelId: string) {
    if (this.models.some((m) => m.id === modelId)) {
      // Hume does not publish a hard maximum — cap at the SDK-wide unique
      // voice ceiling (4) to stay conservative.
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
    const utterances = options.turns.map((t) => ({
      text: t.text,
      voice: { name: t.voice, provider: "HUME_AI" },
    }));

    const version = this.resolveVersion(options.modelId);
    const body: Record<string, unknown> = {
      ...options.providerOptions,
      utterances,
    };
    if (version != null) {
      body.version = version;
    }

    const url = `${this.baseURL}/tts/file`;
    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hume-Api-Key": resolveApiKey(this.apiKey, "HUME_API_KEY", "Hume"),
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `hume/${options.modelId}`);

    const arrayBuffer = await response.arrayBuffer();
    return {
      audio: new Uint8Array(arrayBuffer),
      mediaType: response.headers.get("content-type") ?? "audio/mpeg",
    };
  }
}

export function createHume(config: HumeSpeechProviderConfig = {}) {
  const provider = new HumeSpeechProvider(config);

  return function hume(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
    };
  };
}
