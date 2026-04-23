import { MissingApiKeyError } from "../../errors.js";
import { handleErrorResponse, SDK_USER_AGENT } from "../../provider-utils.js";
import type {
  ModelInfo,
  ResolvedModel,
  SpeechProvider,
} from "../../speech-provider.js";
import type { TimestampMode, WordTimestamp } from "../../timestamps.js";
import { CartesiaSpeechProvider } from "../cartesia/index.js";
import { DeepgramSpeechProvider } from "../deepgram/index.js";
import { ElevenLabsSpeechProvider } from "../elevenlabs/index.js";
import { FalSpeechProvider } from "../fal/index.js";
import { FishAudioSpeechProvider } from "../fish-audio/index.js";
import { GoogleSpeechProvider } from "../google/index.js";
import { HumeSpeechProvider } from "../hume/index.js";
import { InworldSpeechProvider } from "../inworld/index.js";
import { MistralSpeechProvider } from "../mistral/index.js";
import { MurfSpeechProvider } from "../murf/index.js";
import { OpenAISpeechProvider } from "../openai/index.js";
import { ResembleSpeechProvider } from "../resemble/index.js";
import { XaiSpeechProvider } from "../xai/index.js";

export interface SpeechGatewayProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
}

let cachedModels: readonly ModelInfo[] | undefined;

interface GatewayJsonResponse {
  audio: string;
  mediaType: string;
  providerMetadata?: Record<string, unknown>;
  timestamps?: WordTimestamp[];
  warnings?: string[];
}

// Aggregates every built-in provider's model list under `<provider>/<model>`
// ids so capability checks (e.g. native timestamps) keep working when the
// user routes through the gateway.
function aggregatedModels(): readonly ModelInfo[] {
  if (cachedModels) {
    return cachedModels;
  }
  const sources: SpeechProvider[] = [
    new OpenAISpeechProvider({}),
    new ElevenLabsSpeechProvider({}),
    new DeepgramSpeechProvider({}),
    new CartesiaSpeechProvider({}),
    new HumeSpeechProvider({}),
    new InworldSpeechProvider({}),
    new GoogleSpeechProvider({}),
    new FishAudioSpeechProvider({}),
    new MurfSpeechProvider({}),
    new ResembleSpeechProvider({}),
    new FalSpeechProvider({}),
    new MistralSpeechProvider({}),
    new XaiSpeechProvider({}),
  ];
  cachedModels = sources.flatMap((src) =>
    src.models.map((model) => ({
      id: `${src.id}/${model.id}`,
      releaseDate: model.releaseDate,
      languages: model.languages,
      features: model.features,
    }))
  );
  return cachedModels;
}

export class SpeechGatewayProvider implements SpeechProvider<string, string> {
  readonly id = "speech-gateway";
  readonly defaultModel = "openai/gpt-4o-mini-tts";

  get models(): readonly ModelInfo[] {
    return aggregatedModels();
  }

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: SpeechGatewayProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? "https://api.speechgateway.com/v1";
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private resolveKey(): string {
    const key =
      this.apiKey ??
      (typeof process === "undefined"
        ? undefined
        : process.env?.SPEECH_GATEWAY_API_KEY);
    if (!key) {
      const err = new MissingApiKeyError({
        providerName: "Speech Gateway",
        envVar: "SPEECH_GATEWAY_API_KEY",
      });
      err.message =
        "To use the Speech Gateway, a Wavform AI api key is required. Sign up at https://wavform.ai/ to get a key, then pass it via the `apiKey` option or set the SPEECH_GATEWAY_API_KEY environment variable.";
      throw err;
    }
    return key;
  }

  async generate(options: {
    modelId: string;
    text: string;
    voice?: string;
    providerOptions?: Record<string, unknown>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
    includeTimestamps?: boolean;
    timestamps?: TimestampMode;
    volumeDbfs?: number;
  }): Promise<{
    audio: Uint8Array;
    mediaType: string;
    providerMetadata?: Record<string, unknown>;
    timestamps?: WordTimestamp[];
    warnings?: string[];
  }> {
    if (!options.voice) {
      throw new Error(
        `speech-gateway/${options.modelId}: "voice" is required when routing through the speech gateway in inline mode.`
      );
    }

    const body: Record<string, unknown> = {
      mode: "inline",
      model: options.modelId,
      voice: options.voice,
      text: options.text,
    };
    if (options.includeTimestamps) {
      body.timestamps = options.timestamps ?? "on";
    } else if (options.timestamps) {
      body.timestamps = options.timestamps;
    }
    if (options.volumeDbfs != null) {
      body.volumeDbfs = options.volumeDbfs;
    }
    if (options.providerOptions) {
      body.providerOptions = options.providerOptions;
    }

    const url = `${this.baseURL}/audio/speech`;
    const accept = options.includeTimestamps
      ? "application/json"
      : "audio/mpeg";

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        ...options.headers,
        Accept: accept,
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.resolveKey()}`,
        "X-User-Agent": SDK_USER_AGENT,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `speech-gateway/${options.modelId}`);

    if (
      options.includeTimestamps &&
      response.headers.get("content-type")?.includes("application/json")
    ) {
      const payload = parseGatewayJsonResponse(await response.json());
      return {
        audio: decodeBase64(payload.audio),
        mediaType: payload.mediaType,
        providerMetadata: payload.providerMetadata,
        timestamps: payload.timestamps,
        warnings: payload.warnings,
      };
    }

    const arrayBuffer = await response.arrayBuffer();

    return {
      audio: new Uint8Array(arrayBuffer),
      mediaType: mediaTypeFromHeaders(response.headers),
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
    if (!options.voice) {
      throw new Error(
        `speech-gateway/${options.modelId}: "voice" is required when routing through the speech gateway in inline mode.`
      );
    }

    const body: Record<string, unknown> = {
      mode: "inline",
      model: options.modelId,
      voice: options.voice,
      text: options.text,
    };
    if (options.providerOptions) {
      body.providerOptions = options.providerOptions;
    }

    const url = `${this.baseURL}/audio/speech`;

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        ...options.headers,
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.resolveKey()}`,
        "X-User-Agent": SDK_USER_AGENT,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `speech-gateway/${options.modelId}`);

    if (!response.body) {
      throw new Error(
        `speech-gateway/${options.modelId}: response has no body`
      );
    }

    return {
      stream: response.body,
      mediaType: mediaTypeFromHeaders(response.headers),
    };
  }
}

export function createSpeechGateway(config: SpeechGatewayProviderConfig = {}) {
  const provider = new SpeechGatewayProvider(config);
  return function speechGateway(modelId?: string): ResolvedModel<string> {
    return { provider, modelId: modelId ?? provider.defaultModel };
  };
}

function mediaTypeFromHeaders(headers: Headers): string {
  return headers.get("content-type") ?? "audio/mpeg";
}

function parseGatewayJsonResponse(payload: unknown): GatewayJsonResponse {
  if (!isRecord(payload)) {
    throw new Error("speech-gateway: expected JSON response object");
  }
  if (typeof payload.audio !== "string") {
    throw new Error("speech-gateway: JSON response missing base64 audio");
  }
  if (typeof payload.mediaType !== "string") {
    throw new Error("speech-gateway: JSON response missing mediaType");
  }

  return {
    audio: payload.audio,
    mediaType: payload.mediaType,
    providerMetadata: isRecord(payload.providerMetadata)
      ? payload.providerMetadata
      : undefined,
    timestamps: parseTimestamps(payload.timestamps),
    warnings: parseWarnings(payload.warnings),
  };
}

function parseTimestamps(value: unknown): WordTimestamp[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(
      "speech-gateway: JSON response timestamps must be an array"
    );
  }
  const timestamps: WordTimestamp[] = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      typeof item.text !== "string" ||
      typeof item.start !== "number" ||
      typeof item.end !== "number"
    ) {
      throw new Error(
        "speech-gateway: JSON response contains an invalid timestamp"
      );
    }
    timestamps.push({ text: item.text, start: item.start, end: item.end });
  }
  return timestamps;
}

function parseWarnings(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (
    !(Array.isArray(value) && value.every((item) => typeof item === "string"))
  ) {
    throw new Error("speech-gateway: JSON response warnings must be strings");
  }
  return value;
}

function decodeBase64(value: string): Uint8Array {
  const binaryString = atob(value);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
