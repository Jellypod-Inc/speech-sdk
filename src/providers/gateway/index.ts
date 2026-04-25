import { ApiError, MissingApiKeyError } from "../../errors.js";
import { handleErrorResponse, SDK_USER_AGENT } from "../../provider-utils.js";
import type {
  ModelInfo,
  ResolvedModel,
  SpeechProvider,
} from "../../speech-provider.js";
import type {
  ConversationWordTimestamp,
  WordTimestamp,
} from "../../timestamps.js";

export const SPEECH_GATEWAY_PROVIDER_ID = "speech-gateway" as const;

export interface SpeechGatewayProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
}

// audioDurationMs is intentionally not extracted — the SDK computes audio
// duration client-side via mediabunny so all paths (gateway + direct
// providers) behave identically.
interface GatewayJsonResponse {
  audio: string;
  mediaType: string;
  timestamps: WordTimestamp[];
  warnings: string[];
}

const GATEWAY_401_MESSAGE =
  "Speech Gateway rejected your API key (401). Get a key at https://wavform.ai/ or verify your SPEECH_GATEWAY_API_KEY environment variable.";

export class SpeechGatewayProvider implements SpeechProvider<string, string> {
  readonly id = SPEECH_GATEWAY_PROVIDER_ID;
  readonly defaultModel = "openai/gpt-4o-mini-tts";
  // The gateway server is the source of truth for model capabilities.
  // Client-side model declarations are intentionally empty; feature checks
  // are deferred to the wire — if the gateway can't honor a request it
  // returns an error.
  readonly models: readonly ModelInfo[] = [];

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
    volumeDbfs?: number;
  }): Promise<{
    audio: Uint8Array;
    mediaType: string;
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
    if (options.volumeDbfs != null) {
      body.volumeDbfs = options.volumeDbfs;
    }
    if (options.providerOptions) {
      body.providerOptions = options.providerOptions;
    }

    // Endpoint split: binary vs JSON-with-timestamps lives at two URLs now;
    // Accept-header content negotiation is gone.
    const url = options.includeTimestamps
      ? `${this.baseURL}/audio/speech/with-timestamps`
      : `${this.baseURL}/audio/speech`;
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

    if (response.status === 401) {
      throw new ApiError(GATEWAY_401_MESSAGE, {
        statusCode: 401,
        model: `speech-gateway/${options.modelId}`,
      });
    }
    await handleErrorResponse(response, `speech-gateway/${options.modelId}`);

    if (options.includeTimestamps) {
      const contentType = response.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        throw new Error(
          `speech-gateway/${options.modelId}: requested JSON response for timestamps but server returned content-type "${contentType}"`
        );
      }
      const payload = parseGatewayJsonResponse(await response.json());
      return {
        audio: decodeBase64(payload.audio),
        mediaType: payload.mediaType,
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
        Accept: "audio/mpeg",
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.resolveKey()}`,
        "X-User-Agent": SDK_USER_AGENT,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    if (response.status === 401) {
      throw new ApiError(GATEWAY_401_MESSAGE, {
        statusCode: 401,
        model: `speech-gateway/${options.modelId}`,
      });
    }
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

  // Server stitches, normalizes, and (when includeTimestamps) handles
  // alignment — callers never need their own STT key.
  async generateConversation(options: {
    modelId: string;
    turns: readonly {
      voice: string;
      text: string;
      providerOptions?: Record<string, unknown>;
    }[];
    gapMs?: number;
    volumeDbfs?: number;
    normalizeVolume?: boolean;
    providerOptions?: Record<string, unknown>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
    includeTimestamps?: boolean;
  }): Promise<{
    audio: Uint8Array;
    mediaType: string;
    timestamps?: ConversationWordTimestamp[];
    warnings?: string[];
  }> {
    if (options.turns.length === 0) {
      throw new Error(
        `speech-gateway/${options.modelId}: at least one turn is required.`
      );
    }
    if (!options.turns.every((t) => t.voice)) {
      throw new Error(
        `speech-gateway/${options.modelId}: every turn must specify a "voice" when routing through the speech gateway.`
      );
    }

    // Send gapMs/volumeDbfs/normalizeVolume explicitly every call — don't rely
    // on server defaults (spec). Keep turns flat (voice/text/providerOptions).
    const body: Record<string, unknown> = {
      mode: "conversation",
      model: options.modelId,
      turns: options.turns.map((t) => ({
        voice: t.voice,
        text: t.text,
        ...(t.providerOptions && { providerOptions: t.providerOptions }),
      })),
      gapMs: options.gapMs ?? 300,
      volumeDbfs: options.volumeDbfs ?? -20,
      normalizeVolume: options.normalizeVolume ?? true,
    };
    if (options.providerOptions) {
      body.providerOptions = options.providerOptions;
    }

    const url = options.includeTimestamps
      ? `${this.baseURL}/audio/conversation/with-timestamps`
      : `${this.baseURL}/audio/conversation`;
    const accept = options.includeTimestamps ? "application/json" : "audio/*";

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

    if (response.status === 401) {
      throw new ApiError(GATEWAY_401_MESSAGE, {
        statusCode: 401,
        model: `speech-gateway/${options.modelId}`,
      });
    }
    await handleErrorResponse(response, `speech-gateway/${options.modelId}`);

    if (options.includeTimestamps) {
      const contentType = response.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        throw new Error(
          `speech-gateway/${options.modelId}: requested JSON response for conversation timestamps but server returned content-type "${contentType}"`
        );
      }
      const payload = parseGatewayConversationJsonResponse(
        await response.json()
      );
      return {
        audio: decodeBase64(payload.audio),
        mediaType: payload.mediaType,
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
    timestamps: parseTimestamps(payload.timestamps),
    warnings: parseWarnings(payload.warnings),
  };
}

function parseGatewayConversationJsonResponse(payload: unknown): {
  audio: string;
  mediaType: string;
  timestamps: ConversationWordTimestamp[];
  warnings: string[];
} {
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
    timestamps: parseConversationTimestamps(payload.timestamps),
    warnings: parseWarnings(payload.warnings),
  };
}

function parseConversationTimestamps(
  value: unknown
): ConversationWordTimestamp[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(
      "speech-gateway: JSON response timestamps must be an array"
    );
  }
  const timestamps: ConversationWordTimestamp[] = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      typeof item.text !== "string" ||
      typeof item.start !== "number" ||
      typeof item.end !== "number" ||
      typeof item.turnIndex !== "number"
    ) {
      throw new Error(
        "speech-gateway: JSON response contains an invalid conversation timestamp"
      );
    }
    timestamps.push({
      text: item.text,
      start: item.start,
      end: item.end,
      turnIndex: item.turnIndex,
    });
  }
  return timestamps;
}

function parseTimestamps(value: unknown): WordTimestamp[] {
  if (value === undefined || value === null) {
    return [];
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

function parseWarnings(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
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
