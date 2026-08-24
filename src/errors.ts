export class SpeechSDKError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SpeechSDKError";
  }
}

export class ApiError extends SpeechSDKError {
  readonly statusCode: number;
  readonly responseBody?: unknown;
  // Provider canonical code or RFC 7807 `code` extension.
  readonly code?: string;
  // Set by generateConversation's stitch path; undefined for single-turn calls and single-API-call paths (native dialogue).
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

export type ProviderErrorStage = "alignment" | "synthesis";

export interface SpeechSdkProviderErrorOptions {
  readonly cause?: unknown;
  readonly code?: string;
  readonly details?: unknown;
  readonly model?: string;
  readonly provider: string;
  readonly rawResponse?: string;
  readonly requestId?: string;
  readonly retryAfterMs?: number;
  readonly retryable: boolean;
  readonly stage?: ProviderErrorStage;
  readonly status: number;
  readonly turnIndex?: number;
}

function jsonSafeDetails(value: unknown): unknown {
  const ancestors: object[] = [];

  try {
    const serialized = JSON.stringify(
      value,
      function replaceNonJsonValues(
        this: unknown,
        _key: string,
        nestedValue: unknown
      ): unknown {
        if (typeof nestedValue === "bigint") {
          return `${nestedValue}n`;
        }
        if (typeof nestedValue !== "object" || nestedValue === null) {
          return nestedValue;
        }

        while (ancestors.length > 0 && ancestors.at(-1) !== this) {
          ancestors.pop();
        }
        if (ancestors.includes(nestedValue)) {
          return "[Circular]";
        }
        ancestors.push(nestedValue);
        return nestedValue;
      }
    );
    return serialized === undefined
      ? `[Unserializable ${typeof value}]`
      : JSON.parse(serialized);
  } catch {
    return "[Unserializable details]";
  }
}

export class SpeechSdkProviderError extends ApiError {
  readonly status: number;
  readonly provider: string;
  readonly model?: string;
  readonly details?: unknown;
  readonly rawResponse?: string;
  readonly requestId?: string;
  readonly retryable: boolean;
  readonly stage?: ProviderErrorStage;

  constructor(message: string, options: SpeechSdkProviderErrorOptions) {
    super(message, {
      statusCode: options.status,
      responseBody: options.rawResponse,
      cause: options.cause,
      code: options.code,
      turnIndex: options.turnIndex,
      retryAfterMs: options.retryAfterMs,
    });
    this.name = "SpeechSdkProviderError";
    this.status = options.status;
    this.provider = options.provider;
    this.model = options.model;
    this.details = options.details;
    this.rawResponse = options.rawResponse;
    this.requestId = options.requestId;
    this.retryable = options.retryable;
    this.stage = options.stage;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      statusCode: this.statusCode,
      provider: this.provider,
      ...(this.model !== undefined && { model: this.model }),
      ...(this.code !== undefined && { code: this.code }),
      ...(this.details !== undefined && {
        details: jsonSafeDetails(this.details),
      }),
      ...(this.rawResponse !== undefined && {
        rawResponse: this.rawResponse,
        responseBody: this.responseBody,
      }),
      ...(this.requestId !== undefined && { requestId: this.requestId }),
      retryable: this.retryable,
      ...(this.stage !== undefined && { stage: this.stage }),
      ...(this.turnIndex !== undefined && { turnIndex: this.turnIndex }),
      ...(this.retryAfterMs !== undefined && {
        retryAfterMs: this.retryAfterMs,
      }),
      ...(this.stack !== undefined && { stack: this.stack }),
    };
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
  if (err instanceof SpeechSdkProviderError) {
    return copyProviderError(err, { turnIndex });
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

export function withProviderErrorStage(
  err: unknown,
  stage: ProviderErrorStage
): unknown {
  return err instanceof SpeechSdkProviderError
    ? copyProviderError(err, { stage })
    : err;
}

function copyProviderError(
  error: SpeechSdkProviderError,
  overrides: {
    stage?: ProviderErrorStage;
    turnIndex?: number;
  }
): SpeechSdkProviderError {
  return new SpeechSdkProviderError(error.message, {
    status: error.status,
    provider: error.provider,
    model: error.model,
    code: error.code,
    details: error.details,
    rawResponse: error.rawResponse,
    requestId: error.requestId,
    retryable: error.retryable,
    stage: overrides.stage ?? error.stage,
    turnIndex: overrides.turnIndex ?? error.turnIndex,
    retryAfterMs: error.retryAfterMs,
    cause: error,
  });
}

export class StreamingNotSupportedError extends SpeechSDKError {
  constructor(model: string) {
    super(
      `Streaming is not supported by ${model}. Use generateSpeech() instead.`
    );
    this.name = "StreamingNotSupportedError";
  }
}

export class InstructionsUnsupportedError extends SpeechSDKError {
  readonly model: string;

  constructor(model: string) {
    super(
      `Delivery instructions are not supported by ${model}. Choose a model that declares the instructions capability or omit instructions.`
    );
    this.name = "InstructionsUnsupportedError";
    this.model = model;
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

export class VoiceCloningUnsupportedError extends SpeechSDKError {
  readonly provider: string;

  constructor(provider: string, reason?: string) {
    super(
      `Voice cloning is not supported by ${provider}${reason ? `: ${reason}` : "."}`
    );
    this.name = "VoiceCloningUnsupportedError";
    this.provider = provider;
  }
}

export class TooManyCloneSamplesError extends SpeechSDKError {
  readonly provider: string;
  readonly max: number;
  readonly received: number;

  constructor(provider: string, max: number, received: number) {
    super(
      `${provider} accepts at most ${max} voice sample${max === 1 ? "" : "s"} for cloning, but received ${received}. Pass fewer samples.`
    );
    this.name = "TooManyCloneSamplesError";
    this.provider = provider;
    this.max = max;
    this.received = received;
  }
}

export class CloneSampleFetchError extends SpeechSDKError {
  readonly url: string;
  readonly statusCode?: number;

  constructor(url: string, options?: { statusCode?: number; cause?: unknown }) {
    super(
      `Failed to fetch voice sample from ${url}${options?.statusCode == null ? "" : ` (HTTP ${options.statusCode})`}.`,
      { cause: options?.cause }
    );
    this.name = "CloneSampleFetchError";
    this.url = url;
    this.statusCode = options?.statusCode;
  }
}

export class InvalidCloneFieldError extends SpeechSDKError {
  readonly provider: string;
  readonly field: string;

  constructor(provider: string, field: string, rule: string) {
    super(`${provider}: invalid ${field} — ${rule}`);
    this.name = "InvalidCloneFieldError";
    this.provider = provider;
    this.field = field;
  }
}

export class VoiceDesignUnsupportedError extends SpeechSDKError {
  readonly provider: string;

  constructor(provider: string, reason?: string) {
    super(
      `Voice design is not supported by ${provider}${reason ? `: ${reason}` : "."}`
    );
    this.name = "VoiceDesignUnsupportedError";
    this.provider = provider;
  }
}

export class InvalidDesignFieldError extends SpeechSDKError {
  readonly provider: string;
  readonly field: string;

  constructor(provider: string, field: string, rule: string) {
    super(`${provider}: invalid ${field} — ${rule}`);
    this.name = "InvalidDesignFieldError";
    this.provider = provider;
    this.field = field;
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

export class TimestampProviderRequiredError extends SpeechSDKError {
  readonly model: string;

  constructor(model: string) {
    super(
      `${model} does not return word timestamps natively. Pass timestampProvider when timestamps is true.`
    );
    this.name = "TimestampProviderRequiredError";
    this.model = model;
  }
}

export class TimestampValidationError extends SpeechSDKError {
  readonly reason: "empty" | "invalid_timing" | "transcript_mismatch";
  readonly source: string;

  constructor(options: {
    reason: "empty" | "invalid_timing" | "transcript_mismatch";
    source: string;
  }) {
    super(
      `Timestamp alignment from ${options.source} is invalid: ${options.reason}.`
    );
    this.name = "TimestampValidationError";
    this.reason = options.reason;
    this.source = options.source;
  }
}
