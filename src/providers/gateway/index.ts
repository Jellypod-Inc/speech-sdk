import { z } from "zod";
import type { AudioOutput } from "../../audio-output.js";
import {
  ApiError,
  GatewayInputError,
  MissingApiKeyError,
} from "../../errors.js";
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

// audioDurationMs computed client-side via mediabunny for path consistency across gateway + direct providers.
const wordTimestampSchema = z.object({
  text: z.string(),
  start: z.number(),
  end: z.number(),
});

const conversationWordTimestampSchema = wordTimestampSchema.extend({
  turnIndex: z.number(),
});

const gatewayJsonResponseSchema = z.object({
  audio: z.string(),
  mediaType: z.string(),
  timestamps: z.array(wordTimestampSchema).default([]),
  warnings: z.array(z.string()).default([]),
});

const gatewayConversationJsonResponseSchema = z.object({
  audio: z.string(),
  mediaType: z.string(),
  timestamps: z.array(conversationWordTimestampSchema).default([]),
  warnings: z.array(z.string()).default([]),
  providerMetadata: z.record(z.string(), z.unknown()).optional(),
});

const GATEWAY_401_MESSAGE =
  "Speech Gateway rejected your API key (401). Get a key at https://wavform.ai/ or verify your SPEECH_GATEWAY_API_KEY environment variable.";

export class SpeechGatewayProvider implements SpeechProvider<string, string> {
  readonly id = SPEECH_GATEWAY_PROVIDER_ID;
  readonly defaultModel = "";
  // Gateway server is the source of truth for model capabilities; feature checks deferred to the wire.
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
    output?: AudioOutput;
  }): Promise<{
    audio: Uint8Array;
    mediaType: string;
    timestamps?: WordTimestamp[];
    warnings?: string[];
  }> {
    if (!options.voice) {
      throw new GatewayInputError(
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
    if (options.output) {
      body.output = options.output;
    }

    // Binary vs JSON-with-timestamps lives at separate URLs; no Accept-header content negotiation.
    const url = options.includeTimestamps
      ? `${this.baseURL}/audio/speech/with-timestamps`
      : `${this.baseURL}/audio/speech`;

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

    if (response.status === 401) {
      throw new ApiError(GATEWAY_401_MESSAGE, { statusCode: 401 });
    }
    await handleErrorResponse(response);

    if (options.includeTimestamps) {
      const payload = gatewayJsonResponseSchema.parse(await response.json());
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
      throw new GatewayInputError(
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

    if (response.status === 401) {
      throw new ApiError(GATEWAY_401_MESSAGE, { statusCode: 401 });
    }
    await handleErrorResponse(response);

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

  // Server handles stitching/normalization/alignment so callers never need their own STT key.
  // Pick one of two wire shapes — mutually exclusive at the request level:
  //   1. shared model    — `modelId` set, every turn omits `model`
  //   2. per-turn model  — every turn declares its own `model`, `modelId` omitted (one conversation across providers)
  async generateConversation(options: {
    modelId?: string;
    turns: readonly {
      model?: string;
      voice: string;
      text: string;
      providerOptions?: Record<string, unknown>;
    }[];
    gapMs?: number;
    volumeDbfs?: number;
    providerOptions?: Record<string, unknown>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
    includeTimestamps?: boolean;
    output?: AudioOutput;
  }): Promise<{
    audio: Uint8Array;
    mediaType: string;
    timestamps?: ConversationWordTimestamp[];
    warnings?: string[];
    providerMetadata?: Record<string, unknown>;
  }> {
    if (options.turns.length === 0) {
      throw new GatewayInputError(
        "speech-gateway/conversation: at least one turn is required."
      );
    }
    if (!options.turns.every((t) => t.voice)) {
      throw new GatewayInputError(
        'speech-gateway/conversation: every turn must specify a "voice" when routing through the speech gateway.'
      );
    }

    const sharedModel = options.modelId;
    const anyTurnModel = options.turns.some((t) => t.model != null);
    if (sharedModel != null && anyTurnModel) {
      throw new GatewayInputError(
        "speech-gateway/conversation: pass either a shared `modelId` or per-turn `model` on every turn — not both."
      );
    }
    if (sharedModel == null && !options.turns.every((t) => t.model)) {
      throw new GatewayInputError(
        'speech-gateway/conversation: when no shared `modelId` is set, every turn must declare its own "model".'
      );
    }

    // gapMs/volumeDbfs sent explicitly each call (don't rely on server defaults).
    const body: Record<string, unknown> = {
      mode: "conversation",
      ...(sharedModel != null && { model: sharedModel }),
      turns: options.turns.map((t) => ({
        ...(t.model != null && { model: t.model }),
        voice: t.voice,
        text: t.text,
        ...(t.providerOptions && { providerOptions: t.providerOptions }),
      })),
      gapMs: options.gapMs ?? 300,
      volumeDbfs: options.volumeDbfs ?? -20,
    };
    if (options.providerOptions) {
      body.providerOptions = options.providerOptions;
    }
    if (options.output) {
      body.output = options.output;
    }

    const url = options.includeTimestamps
      ? `${this.baseURL}/audio/conversation/with-timestamps`
      : `${this.baseURL}/audio/conversation`;

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

    if (response.status === 401) {
      throw new ApiError(GATEWAY_401_MESSAGE, { statusCode: 401 });
    }
    await handleErrorResponse(response);

    if (options.includeTimestamps) {
      const payload = gatewayConversationJsonResponseSchema.parse(
        await response.json()
      );
      return {
        audio: decodeBase64(payload.audio),
        mediaType: payload.mediaType,
        timestamps: payload.timestamps,
        warnings: payload.warnings,
        ...(payload.providerMetadata !== undefined && {
          providerMetadata: payload.providerMetadata,
        }),
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
  return function speechGateway(modelId: string): ResolvedModel<string> {
    if (!modelId) {
      throw new Error(
        'Speech Gateway requires a model ID (e.g., "openai/gpt-4o-mini-tts"). The gateway routes to upstream providers and has no default model.'
      );
    }
    return { provider, modelId };
  };
}

function mediaTypeFromHeaders(headers: Headers): string {
  return headers.get("content-type") ?? "audio/mpeg";
}

function decodeBase64(value: string): Uint8Array {
  const binaryString = atob(value);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
