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

    const body: Record<string, unknown> = {
      ...options.providerOptions,
      AudioFormat: "mp3",
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
      mediaType: "audio/mpeg",
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
      ...options.providerOptions,
      AudioFormat: "mp3",
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
      mediaType: response.headers.get("content-type") ?? "audio/mpeg",
    };
  }

  getStitchOptions(_modelId: string) {
    // Unreal Speech's generate() currently hard-codes AudioFormat: "mp3" and
    // always returns audio/mpeg. Stitch needs PCM/WAV with a matching
    // mediaType. Returning undefined surfaces StitchUnsupportedError at
    // dispatch time with a clear message to the caller.
    return undefined;
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
