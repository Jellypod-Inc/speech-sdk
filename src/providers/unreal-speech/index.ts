import { ApiError } from "../../errors.js";
import { handleErrorResponse, resolveApiKey } from "../../provider-utils.js";
import type { ResolvedModel, SpeechProvider } from "../../speech-provider.js";

export interface UnrealSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
}

export class UnrealSpeechProvider implements SpeechProvider<string, string> {
  readonly id = "unreal-speech";
  readonly defaultModel = "default";

  readonly models = [
    {
      id: "default",
      releaseDate: "2025-06-01",
      languages: ["en", "zh", "hi", "es", "pt", "ja", "fr", "it"],
      features: ["streaming"],
    },
  ] as const;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: UnrealSpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? "https://api.v8.unrealspeech.com";
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
    providerMetadata?: Record<string, unknown>;
  }> {
    const url = `${this.baseURL}/speech`;

    // Defaults are applied first so providerOptions (including AudioFormat)
    // override them; output bytes' mediaType is then derived from whatever
    // AudioFormat ended up in the request.
    const body: Record<string, unknown> = {
      AudioFormat: "mp3",
      ...options.providerOptions,
      OutputFormat: "uri",
      VoiceId: options.voice,
      Text: options.text,
    };

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolveApiKey(this.apiKey, "UNREAL_SPEECH_API_KEY", "Unreal Speech")}`,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `unreal-speech/${options.modelId}`);

    const json = (await response.json()) as { OutputUri: string };

    const audioResponse = await this.fetchFn(json.OutputUri, {
      signal: options.abortSignal,
    });

    if (!audioResponse.ok) {
      throw new ApiError(`API error: ${audioResponse.status}`, {
        statusCode: audioResponse.status,
        model: `unreal-speech/${options.modelId}`,
        responseBody: await audioResponse.text().catch(() => undefined),
      });
    }

    const arrayBuffer = await audioResponse.arrayBuffer();

    return {
      audio: new Uint8Array(arrayBuffer),
      mediaType: mediaTypeForAudioFormat(body.AudioFormat),
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
    const url = `${this.baseURL}/stream`;

    const body: Record<string, unknown> = {
      AudioFormat: "mp3",
      ...options.providerOptions,
      VoiceId: options.voice,
      Text: options.text,
    };

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolveApiKey(this.apiKey, "UNREAL_SPEECH_API_KEY", "Unreal Speech")}`,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `unreal-speech/${options.modelId}`);

    if (!response.body) {
      throw new Error(`unreal-speech/${options.modelId}: response has no body`);
    }

    return {
      stream: response.body,
      mediaType:
        response.headers.get("content-type") ??
        mediaTypeForAudioFormat(body.AudioFormat),
    };
  }

  getStitchOptions(modelId: string) {
    if (this.models.some((m) => m.id === modelId)) {
      // v8 docs list pcm_s16le as a valid AudioFormat that emits 22050 Hz
      // raw 16-bit signed LE PCM. Routing the stitch path through the same
      // /speech endpoint as generate() keeps the two-step JSON-then-CDN
      // fetch flow intact.
      return {
        providerOptions: { AudioFormat: "pcm_s16le" },
        mediaType: "audio/pcm;rate=22050",
      };
    }
    return undefined;
  }
}

function mediaTypeForAudioFormat(format: unknown): string {
  switch (format) {
    case "pcm_s16le":
      return "audio/pcm;rate=22050";
    case "pcm_mulaw":
      return "audio/basic";
    default:
      return "audio/mpeg";
  }
}

export function createUnrealSpeech(config: UnrealSpeechProviderConfig = {}) {
  const provider = new UnrealSpeechProvider(config);

  return function unrealSpeech(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
    };
  };
}
