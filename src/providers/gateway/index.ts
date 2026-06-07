import { z } from "zod";
import type { AudioOutput } from "../../audio-output.js";
import {
  ApiError,
  GatewayInputError,
  MissingApiKeyError,
  VoiceResolutionError,
  type VoiceResolutionReason,
} from "../../errors.js";
import type { PronunciationsInput } from "../../pronunciations/types.js";
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
  "Speechbase rejected your API key (401). Get a key at https://speechbase.ai/ or verify your SPEECHBASE_API_KEY environment variable.";

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
    this.baseURL = config.baseURL ?? "https://api.speechbase.ai/v1";
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private resolveKey(): string {
    // SPEECHBASE_API_KEY is the current name; SPEECH_GATEWAY_API_KEY stays as a legacy fallback.
    // `||` (not `??`) so an empty-string value also falls through to the legacy var.
    const envKey =
      typeof process === "undefined"
        ? undefined
        : process.env?.SPEECHBASE_API_KEY ||
          process.env?.SPEECH_GATEWAY_API_KEY;
    const key = this.apiKey ?? envKey;
    if (!key) {
      const err = new MissingApiKeyError({
        providerName: "Speechbase",
        envVar: "SPEECHBASE_API_KEY",
      });
      err.message =
        "Speechbase requires an API key. Sign up at https://speechbase.ai/ to get a key, then pass it via createSpeechGateway({ apiKey }) or set the SPEECHBASE_API_KEY environment variable (the legacy SPEECH_GATEWAY_API_KEY is still honored).";
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
    pronunciations?: PronunciationsInput;
    moderationRulesetId?: string;
    speed?: number;
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
    if (options.pronunciations) {
      body.pronunciations = options.pronunciations;
    }
    if (options.moderationRulesetId !== undefined) {
      body.moderation_ruleset_id = options.moderationRulesetId;
    }
    if (options.speed != null) {
      body.speed = options.speed;
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

  // Voice-path entry point: POSTs an arbitrary body to /v1/audio/speech (or /with-timestamps). Used by the `generateSpeech({ voiceId, text })` variant where there's no inline model/voice to massage.
  async generateRaw(args: {
    body: Record<string, unknown>;
    includeTimestamps: boolean;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<{
    audio: Uint8Array;
    mediaType: string;
    timestamps?: WordTimestamp[];
    warnings?: string[];
  }> {
    const url = args.includeTimestamps
      ? `${this.baseURL}/audio/speech/with-timestamps`
      : `${this.baseURL}/audio/speech`;

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        ...args.headers,
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.resolveKey()}`,
        "X-User-Agent": SDK_USER_AGENT,
      },
      body: JSON.stringify(args.body),
      signal: args.abortSignal,
    });

    if (response.status === 401) {
      throw new ApiError(GATEWAY_401_MESSAGE, { statusCode: 401 });
    }
    const fallbackVoiceId =
      typeof args.body.voiceId === "string" ? args.body.voiceId : "";
    try {
      await handleErrorResponse(response);
    } catch (err) {
      maybeMapToVoiceResolutionError(err, fallbackVoiceId);
      throw err;
    }

    if (args.includeTimestamps) {
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
    pronunciations?: PronunciationsInput;
    moderationRulesetId?: string;
  }): Promise<{
    audioDurationMs?: number;
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
      model: options.modelId,
      voice: options.voice,
      text: options.text,
    };
    if (options.providerOptions) {
      body.providerOptions = options.providerOptions;
    }
    if (options.pronunciations) {
      body.pronunciations = options.pronunciations;
    }
    if (options.moderationRulesetId !== undefined) {
      body.moderation_ruleset_id = options.moderationRulesetId;
    }

    // Streaming has its own endpoint; /audio/speech is the buffered path (whole-clip).
    const url = `${this.baseURL}/audio/speech/stream`;

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

  // Voice-path streaming entry point. Routes to the dedicated streaming endpoint so the SDK keeps true chunked-transfer streaming on the Voice arm.
  async streamRaw(args: {
    body: Record<string, unknown>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<{
    stream: ReadableStream<Uint8Array>;
    mediaType: string;
  }> {
    const url = `${this.baseURL}/audio/speech/stream`;
    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        ...args.headers,
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.resolveKey()}`,
        "X-User-Agent": SDK_USER_AGENT,
      },
      body: JSON.stringify(args.body),
      signal: args.abortSignal,
    });

    if (response.status === 401) {
      throw new ApiError(GATEWAY_401_MESSAGE, { statusCode: 401 });
    }
    const fallbackVoiceId =
      typeof args.body.voiceId === "string" ? args.body.voiceId : "";
    try {
      await handleErrorResponse(response);
    } catch (err) {
      maybeMapToVoiceResolutionError(err, fallbackVoiceId);
      throw err;
    }

    if (!response.body) {
      throw new Error("speech-gateway: response has no body");
    }

    return {
      stream: response.body,
      mediaType: mediaTypeFromHeaders(response.headers),
    };
  }

  // Server handles stitching/normalization/alignment so callers never need their own STT key.
  // Wire shapes per turn:
  //   1. shared model    — `modelId` set, inline turns omit `model`
  //   2. per-turn model  — inline turns declare `model`, `modelId` omitted (one conversation across providers)
  //   3. voice turn      — turn carries `voiceId` instead of `model`+`voice`; resolved server-side
  async generateConversation(options: {
    modelId?: string;
    turns: readonly (
      | {
          model?: string;
          voice: string;
          text: string;
          providerOptions?: Record<string, unknown>;
          speed?: number;
        }
      | {
          voiceId: string;
          text: string;
          providerOptions?: Record<string, unknown>;
          speed?: number;
        }
    )[];
    gapMs?: number;
    volumeDbfs?: number;
    providerOptions?: Record<string, unknown>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
    includeTimestamps?: boolean;
    output?: AudioOutput;
    pronunciations?: PronunciationsInput;
    moderationRulesetId?: string;
    speed?: number;
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
    if (
      !options.turns.every((t) => "voiceId" in t || ("voice" in t && t.voice))
    ) {
      throw new GatewayInputError(
        'speech-gateway/conversation: every turn must specify a "voice" or "voiceId" when routing through the speech gateway.'
      );
    }

    const sharedModel = options.modelId;
    const anyTurnModel = options.turns.some(
      (t) => "model" in t && t.model != null
    );
    if (sharedModel != null && anyTurnModel) {
      throw new GatewayInputError(
        "speech-gateway/conversation: pass either a shared `modelId` or per-turn `model` on every turn — not both."
      );
    }
    if (
      sharedModel == null &&
      !options.turns.every((t) => "voiceId" in t || ("model" in t && t.model))
    ) {
      throw new GatewayInputError(
        'speech-gateway/conversation: when no shared `modelId` is set, every inline turn must declare its own "model" (voice turns are exempt).'
      );
    }

    // gapMs/volumeDbfs sent explicitly each call (don't rely on server defaults).
    const body: Record<string, unknown> = {
      mode: "conversation",
      ...(sharedModel != null && { model: sharedModel }),
      turns: options.turns.map((t) => {
        if ("voiceId" in t) {
          return {
            voiceId: t.voiceId,
            text: t.text,
            ...(t.providerOptions && { providerOptions: t.providerOptions }),
            ...(t.speed != null && { speed: t.speed }),
          };
        }
        return {
          ...(t.model != null && { model: t.model }),
          voice: t.voice,
          text: t.text,
          ...(t.providerOptions && { providerOptions: t.providerOptions }),
          ...(t.speed != null && { speed: t.speed }),
        };
      }),
      gapMs: options.gapMs ?? 300,
      volumeDbfs: options.volumeDbfs ?? -20,
    };
    if (options.providerOptions) {
      body.providerOptions = options.providerOptions;
    }
    if (options.output) {
      body.output = options.output;
    }
    if (options.pronunciations) {
      body.pronunciations = options.pronunciations;
    }
    if (options.moderationRulesetId !== undefined) {
      body.moderation_ruleset_id = options.moderationRulesetId;
    }
    if (options.speed != null) {
      body.speed = options.speed;
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
    const firstVoiceTurn = options.turns.find(
      (t): t is Extract<(typeof options.turns)[number], { voiceId: string }> =>
        "voiceId" in t
    );
    const fallbackVoiceId = firstVoiceTurn?.voiceId ?? "";
    try {
      await handleErrorResponse(response);
    } catch (err) {
      maybeMapToVoiceResolutionError(err, fallbackVoiceId);
      throw err;
    }

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

export interface SpeechGateway {
  (modelId: string): ResolvedModel<string>;
  readonly provider: SpeechGatewayProvider;
}

export function createSpeechGateway(
  config: SpeechGatewayProviderConfig = {}
): SpeechGateway {
  const provider = new SpeechGatewayProvider(config);
  const fn = ((modelId: string): ResolvedModel<string> => {
    if (!modelId) {
      throw new GatewayInputError(
        'Speech Gateway requires a model ID (e.g., "openai/gpt-4o-mini-tts"). For Voice calls, pass `voiceId` on generateSpeech options instead.'
      );
    }
    return { provider, modelId };
  }) as SpeechGateway;
  Object.defineProperty(fn, "provider", { value: provider, enumerable: true });
  return fn;
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

// Inspects an ApiError thrown by handleErrorResponse for the gateway's voice_*
// error codes and re-throws as VoiceResolutionError when matched. Returns
// without throwing for any other error.
function maybeMapToVoiceResolutionError(
  err: unknown,
  fallbackVoiceId: string
): void {
  if (!(err instanceof ApiError)) {
    return;
  }
  // Server returns code on RFC 7807 envelopes; provider-utils.ts surfaces it on ApiError.
  const code = err.code;
  const reason = mapVoiceErrorCodeToReason(code);
  if (!reason) {
    return;
  }
  const voiceId = extractVoiceIdFromMessage(err.message) ?? fallbackVoiceId;
  throw new VoiceResolutionError(reason, voiceId, err.message);
}

function mapVoiceErrorCodeToReason(
  code: string | undefined
): VoiceResolutionReason | undefined {
  if (!code) {
    return;
  }
  if (code === "voice_not_found") {
    return "not_found";
  }
  if (code === "voice_incomplete") {
    return "incomplete";
  }
  if (code === "unknown_provider") {
    return "unknown_provider";
  }
  return;
}

const VOICE_ID_IN_MESSAGE_RE = /'([0-9a-f-]{8,})'/i;

function extractVoiceIdFromMessage(message: string): string | undefined {
  const match = VOICE_ID_IN_MESSAGE_RE.exec(message);
  return match?.[1];
}
