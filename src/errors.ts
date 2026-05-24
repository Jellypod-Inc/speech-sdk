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
    super(
      `${model} does not support sampleRate ${requested}. Supported rates: ${supported.join(", ")}.`
    );
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
