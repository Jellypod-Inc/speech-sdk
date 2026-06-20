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
