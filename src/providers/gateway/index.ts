import { z } from "zod";
import { base64ToUint8Array } from "../../audio-utils.js";
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

// Shape of the voice-arm wire body. Single-shot endpoints use the full set;
// the conversation per-turn shape is narrower (only voiceId/text/providerOptions/speed)
// and the helper's spread guards drop the unused fields cleanly.
export interface VoiceBodyInput {
  voiceId: string;
  text: string;
  providerOptions?: Record<string, unknown>;
  output?: AudioOutput;
  volumeDbfs?: number;
  pronunciations?: PronunciationsInput;
  moderationRulesetId?: string;
  speed?: number;
}

export interface VoiceWireBody {
  voiceId: string;
  text: string;
  providerOptions?: Record<string, unknown>;
  output?: AudioOutput;
  volumeDbfs?: number;
  pronunciations?: PronunciationsInput;
  moderation_ruleset_id?: string;
  speed?: number;
}

export function buildVoiceBody(input: VoiceBodyInput): VoiceWireBody {
  return {
    voiceId: input.voiceId,
    text: input.text,
    ...(input.providerOptions && { providerOptions: input.providerOptions }),
    ...(input.output && { output: input.output }),
    ...(input.volumeDbfs != null && { volumeDbfs: input.volumeDbfs }),
    ...(input.pronunciations && { pronunciations: input.pronunciations }),
    ...(input.moderationRulesetId !== undefined && {
      moderation_ruleset_id: input.moderationRulesetId,
    }),
    ...(input.speed != null && { speed: input.speed }),
  };
}

// Mirror of buildVoiceBody for the inline arm. Single-shot generate uses the
// full field set; stream omits whole-clip params (output/volumeDbfs/speed);
// conversation per-turn omits whole-clip params + pronunciations/moderation.
// In every case the spread guards drop unset fields cleanly.
export interface InlineBodyInput {
  model?: string;
  voice: string;
  text: string;
  providerOptions?: Record<string, unknown>;
  output?: AudioOutput;
  volumeDbfs?: number;
  pronunciations?: PronunciationsInput;
  moderationRulesetId?: string;
  speed?: number;
}

export interface InlineWireBody {
  model?: string;
  voice: string;
  text: string;
  providerOptions?: Record<string, unknown>;
  output?: AudioOutput;
  volumeDbfs?: number;
  pronunciations?: PronunciationsInput;
  moderation_ruleset_id?: string;
  speed?: number;
}

export function buildInlineBody(input: InlineBodyInput): InlineWireBody {
  return {
    ...(input.model != null && { model: input.model }),
    voice: input.voice,
    text: input.text,
    ...(input.providerOptions && { providerOptions: input.providerOptions }),
    ...(input.output && { output: input.output }),
    ...(input.volumeDbfs != null && { volumeDbfs: input.volumeDbfs }),
    ...(input.pronunciations && { pronunciations: input.pronunciations }),
    ...(input.moderationRulesetId !== undefined && {
      moderation_ruleset_id: input.moderationRulesetId,
    }),
    ...(input.speed != null && { speed: input.speed }),
  };
}

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

  // Single chokepoint for every gateway POST: URL + auth + 401 + RFC 7807
  // error mapping. Pass `voiceIdForErrorMap` on the voice paths so
  // voice_not_found / voice_incomplete / unknown_provider get surfaced as
  // VoiceResolutionError instead of generic ApiError.
  private async postJson(args: {
    path: string;
    body: object;
    abortSignal: AbortSignal | undefined;
    headers: Record<string, string> | undefined;
    voiceIdForErrorMap?: string;
  }): Promise<Response> {
    const response = await this.fetchFn(`${this.baseURL}${args.path}`, {
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

    if (args.voiceIdForErrorMap !== undefined) {
      try {
        await handleErrorResponse(response);
      } catch (err) {
        maybeMapToVoiceResolutionError(err, args.voiceIdForErrorMap);
        throw err;
      }
    } else {
      await handleErrorResponse(response);
    }

    return response;
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

    const body = buildInlineBody({
      model: options.modelId,
      voice: options.voice,
      text: options.text,
      providerOptions: options.providerOptions,
      output: options.output,
      volumeDbfs: options.volumeDbfs,
      pronunciations: options.pronunciations,
      moderationRulesetId: options.moderationRulesetId,
      speed: options.speed,
    });

    // Binary vs JSON-with-timestamps lives at separate URLs; no Accept-header content negotiation.
    const path = options.includeTimestamps
      ? "/audio/speech/with-timestamps"
      : "/audio/speech";

    const response = await this.postJson({
      path,
      body,
      abortSignal: options.abortSignal,
      headers: options.headers,
    });

    return await readSpeechResponse(response, options.includeTimestamps ?? false);
  }

  // Voice-path entry point: typed equivalent of generate() for callers that
  // route by saved-voice UUID. Body shape is owned by buildVoiceBody.
  async generateByVoiceId(options: VoiceBodyInput & {
    includeTimestamps: boolean;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<{
    audio: Uint8Array;
    mediaType: string;
    timestamps?: WordTimestamp[];
    warnings?: string[];
  }> {
    const path = options.includeTimestamps
      ? "/audio/speech/with-timestamps"
      : "/audio/speech";

    const response = await this.postJson({
      path,
      body: buildVoiceBody(options),
      abortSignal: options.abortSignal,
      headers: options.headers,
      voiceIdForErrorMap: options.voiceId,
    });

    return await readSpeechResponse(response, options.includeTimestamps);
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

    const body = buildInlineBody({
      model: options.modelId,
      voice: options.voice,
      text: options.text,
      providerOptions: options.providerOptions,
      pronunciations: options.pronunciations,
      moderationRulesetId: options.moderationRulesetId,
    });

    // Streaming has its own endpoint; /audio/speech is the buffered path (whole-clip).
    const response = await this.postJson({
      path: "/audio/speech/stream",
      body,
      abortSignal: options.abortSignal,
      headers: options.headers,
    });

    return readStreamResponse(response, options.modelId);
  }

  // Voice-path streaming entry point: typed equivalent of stream() for callers
  // routing by saved-voice UUID. The wire body excludes whole-clip params
  // (output/volumeDbfs/speed) because the streaming endpoint rejects them.
  async streamByVoiceId(options: {
    voiceId: string;
    text: string;
    providerOptions?: Record<string, unknown>;
    pronunciations?: PronunciationsInput;
    moderationRulesetId?: string;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<{
    stream: ReadableStream<Uint8Array>;
    mediaType: string;
  }> {
    const response = await this.postJson({
      path: "/audio/speech/stream",
      body: buildVoiceBody(options),
      abortSignal: options.abortSignal,
      headers: options.headers,
      voiceIdForErrorMap: options.voiceId,
    });

    return readStreamResponse(response);
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
    // Turns are already in wire shape (caller owns shaping via buildVoiceBody /
    // buildInlineBody); pass them through unchanged.
    const body: Record<string, unknown> = {
      mode: "conversation",
      ...(sharedModel != null && { model: sharedModel }),
      turns: options.turns,
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

    const path = options.includeTimestamps
      ? "/audio/conversation/with-timestamps"
      : "/audio/conversation";

    // Only map voice errors when the request actually carried a voiceId;
    // an inline-only conversation that 400s with a `voice_*` code would be
    // misattributed otherwise.
    const firstVoiceId = options.turns.find((t) => "voiceId" in t)?.voiceId;

    const response = await this.postJson({
      path,
      body,
      abortSignal: options.abortSignal,
      headers: options.headers,
      ...(firstVoiceId !== undefined && { voiceIdForErrorMap: firstVoiceId }),
    });

    if (options.includeTimestamps) {
      const payload = gatewayConversationJsonResponseSchema.parse(
        await response.json()
      );
      return {
        audio: base64ToUint8Array(payload.audio),
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

async function readSpeechResponse(
  response: Response,
  includeTimestamps: boolean
): Promise<{
  audio: Uint8Array;
  mediaType: string;
  timestamps?: WordTimestamp[];
  warnings?: string[];
}> {
  if (includeTimestamps) {
    const payload = gatewayJsonResponseSchema.parse(await response.json());
    return {
      audio: base64ToUint8Array(payload.audio),
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

function readStreamResponse(
  response: Response,
  modelId?: string
): { stream: ReadableStream<Uint8Array>; mediaType: string } {
  if (!response.body) {
    throw new Error(
      modelId
        ? `speech-gateway/${modelId}: response has no body`
        : "speech-gateway: response has no body"
    );
  }
  return {
    stream: response.body,
    mediaType: mediaTypeFromHeaders(response.headers),
  };
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

// Lazy default gateway for the no-explicit-gateway voice path. Built on first
// use and reused; stateless across calls (apiKey is read from env on each
// request via SpeechGatewayProvider.resolveKey).
let defaultGatewaySingleton: SpeechGateway | undefined;
export function getDefaultSpeechGateway(): SpeechGateway {
  defaultGatewaySingleton ??= createSpeechGateway();
  return defaultGatewaySingleton;
}

function mediaTypeFromHeaders(headers: Headers): string {
  return headers.get("content-type") ?? "audio/mpeg";
}

// Inspects an ApiError thrown by handleErrorResponse for the gateway's voice_*
// error codes and re-throws as VoiceResolutionError when matched. Returns
// without throwing for any other error. VoiceResolutionError extends ApiError,
// so the original `statusCode` / `code` / `responseBody` survive the mapping.
function maybeMapToVoiceResolutionError(
  err: unknown,
  fallbackVoiceId: string
): void {
  if (!(err instanceof ApiError)) {
    return;
  }
  const reason = mapVoiceErrorCodeToReason(err.code);
  if (!reason) {
    return;
  }
  const voiceId = extractVoiceIdFromMessage(err.message) ?? fallbackVoiceId;
  throw new VoiceResolutionError(reason, voiceId, {
    statusCode: err.statusCode,
    message: err.message,
    code: err.code,
    responseBody: err.responseBody,
    cause: err,
  });
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
