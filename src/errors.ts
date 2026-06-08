export class SpeechSDKError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SpeechSDKError";
  }
}

export class ApiError extends SpeechSDKError {
  readonly statusCode: number;
  readonly responseBody?: unknown;
  // RFC 7807 `code` extension; only Speech Gateway populates it today.
  readonly code?: string;
  // Set by generateConversation's stitch path; undefined for single-turn calls and single-API-call paths (gateway, native dialogue).
  readonly turnIndex?: number;
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    options: {
      statusCode: number;
      responseBody?: unknown;
      cause?: unknown;
      code?: string;
      turnIndex?: number;
      retryAfterMs?: number;
    }
  ) {
    super(message, { cause: options.cause });
    this.name = "ApiError";
    this.statusCode = options.statusCode;
    this.responseBody = options.responseBody;
    this.code = options.code;
    this.turnIndex = options.turnIndex;
    this.retryAfterMs = options.retryAfterMs;
  }
}

export class NoSpeechGeneratedError extends SpeechSDKError {
  // Set by generateConversation's stitch path; undefined for single-turn calls.
  readonly turnIndex?: number;

  constructor(message?: string, options?: { turnIndex?: number }) {
    super(message ?? "No speech audio was generated.");
    this.name = "NoSpeechGeneratedError";
    this.turnIndex = options?.turnIndex;
  }
}

export function withTurnIndex(err: unknown, turnIndex: number): unknown {
  // VoiceResolutionError extends ApiError; check the subclass first so the
  // typed `.reason` / `.voiceId` contract survives conversation error wrapping.
  if (err instanceof VoiceResolutionError) {
    return new VoiceResolutionError(err.reason, err.voiceId, {
      statusCode: err.statusCode,
      message: err.message,
      code: err.code,
      cause: err,
      responseBody: err.responseBody,
      turnIndex,
      retryAfterMs: err.retryAfterMs,
    });
  }
  if (err instanceof ApiError) {
    return new ApiError(err.message, {
      statusCode: err.statusCode,
      responseBody: err.responseBody,
      code: err.code,
      cause: err,
      turnIndex,
      retryAfterMs: err.retryAfterMs,
    });
  }
  if (err instanceof NoSpeechGeneratedError) {
    return new NoSpeechGeneratedError(err.message, { turnIndex });
  }
  return err;
}

export class StreamingNotSupportedError extends SpeechSDKError {
  constructor(model: string) {
    super(
      `Streaming is not supported by ${model}. Use generateSpeech() instead.`
    );
    this.name = "StreamingNotSupportedError";
  }
}

export class VolumeAdjustmentUnsupportedError extends SpeechSDKError {
  constructor(model: string) {
    super(
      `volumeDbfs is not supported by ${model}: the provider doesn't expose a decodable PCM/WAV output mode.`
    );
    this.name = "VolumeAdjustmentUnsupportedError";
  }
}

export class UnsupportedSampleRateError extends SpeechSDKError {
  readonly requested: number;
  readonly supported: readonly number[];

  constructor(model: string, requested: number, supported: readonly number[]) {
    const detail =
      supported.length > 0
        ? ` Supported rates: ${supported.join(", ")}.`
        : " This provider does not support sample rate selection.";
    super(`${model} does not support sampleRate ${requested}.${detail}`);
    this.name = "UnsupportedSampleRateError";
    this.requested = requested;
    this.supported = supported;
  }
}

export class OutputConversionUnsupportedError extends SpeechSDKError {
  constructor(model: string) {
    super(
      `Explicit output format is not supported by ${model}: the provider doesn't expose a decodable PCM/WAV output mode.`
    );
    this.name = "OutputConversionUnsupportedError";
  }
}

export class TextChunkingUnsupportedError extends SpeechSDKError {
  constructor(model: string, maxInputChars: number) {
    super(
      `${model} requires chunking at ${maxInputChars} input characters, but the provider doesn't expose a decodable PCM/WAV output mode for stitching chunks.`
    );
    this.name = "TextChunkingUnsupportedError";
  }
}

export class AudioOutputInputError extends SpeechSDKError {
  constructor(message: string) {
    super(message);
    this.name = "AudioOutputInputError";
  }
}

export class GatewayInputError extends SpeechSDKError {
  constructor(message: string) {
    super(message);
    this.name = "GatewayInputError";
  }
}

export class ModerationRulesetIdRequiresGatewayError extends SpeechSDKError {
  constructor() {
    super(
      "moderationRulesetId requires the gateway path. Use a gateway model string (e.g., 'openai/tts-1') or createSpeechGateway() — the field is meaningless without a gateway in front."
    );
    this.name = "ModerationRulesetIdRequiresGatewayError";
  }
}

export function assertGatewayForModerationRulesetId(
  moderationRulesetId: string | undefined,
  isGateway: boolean
): void {
  if (moderationRulesetId !== undefined && !isGateway) {
    throw new ModerationRulesetIdRequiresGatewayError();
  }
}

export class MissingApiKeyError extends SpeechSDKError {
  readonly providerName: string;
  readonly envVar: string;

  constructor(options: { providerName: string; envVar: string }) {
    super(
      `${options.providerName} API key is required. Pass it via apiKey option or set the ${options.envVar} environment variable.`
    );
    this.name = "MissingApiKeyError";
    this.providerName = options.providerName;
    this.envVar = options.envVar;
  }
}

export type VoiceResolutionReason =
  | "not_found"
  | "incomplete"
  | "unknown_provider";

// Extends ApiError so callers catching `err instanceof ApiError && statusCode === 404`
// keep working; the typed Voice resolution semantics live on `.reason` / `.voiceId`.
export class VoiceResolutionError extends ApiError {
  readonly reason: VoiceResolutionReason;
  readonly voiceId: string;

  constructor(
    reason: VoiceResolutionReason,
    voiceId: string,
    options: {
      statusCode: number;
      message?: string;
      code?: string;
      cause?: unknown;
      responseBody?: unknown;
      turnIndex?: number;
      retryAfterMs?: number;
    }
  ) {
    super(
      options.message ?? VoiceResolutionError.defaultMessage(reason, voiceId),
      {
        statusCode: options.statusCode,
        code: options.code,
        cause: options.cause,
        responseBody: options.responseBody,
        turnIndex: options.turnIndex,
        retryAfterMs: options.retryAfterMs,
      }
    );
    this.name = "VoiceResolutionError";
    this.reason = reason;
    this.voiceId = voiceId;
  }

  private static defaultMessage(
    reason: VoiceResolutionReason,
    voiceId: string
  ): string {
    switch (reason) {
      case "not_found":
        return `Voice not found: no Voice with id '${voiceId}' in your organization.`;
      case "incomplete":
        return `Voice '${voiceId}' is missing a provider voice_id. Update it in the dashboard or via PUT /v1/voices/{voiceId} before using it.`;
      case "unknown_provider":
        return `Voice '${voiceId}' references a provider that this SDK doesn't recognize. The provider may have been deprecated.`;
      default: {
        const _exhaustive: never = reason;
        return _exhaustive;
      }
    }
  }
}

export class TimestampKeyMissingError extends SpeechSDKError {
  constructor(options: {
    ttsModel: string;
    sttProvider: string;
    envVar: string;
  }) {
    super(
      `${options.ttsModel} does not return word timestamps natively. ` +
        `Set ${options.envVar} to use the default ${options.sttProvider} fallback, ` +
        "or pass an explicit fallbackSTT to your provider factory " +
        "(e.g. createElevenLabs({ apiKey, fallbackSTT: createOpenAI({ apiKey: '...' }).stt('whisper-1') }))."
    );
    this.name = "TimestampKeyMissingError";
  }
}
