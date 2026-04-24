export class SpeechSDKError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SpeechSDKError";
  }
}

export class ApiError extends SpeechSDKError {
  readonly statusCode: number;
  readonly responseBody?: unknown;
  readonly model: string;
  /**
   * Stable machine-readable error code from RFC 7807 `application/problem+json`
   * responses (the `code` extension). Optional — only populated when the
   * provider emits it (currently Speech Gateway). Callers can match on this
   * instead of parsing error messages.
   */
  readonly code?: string;

  constructor(
    message: string,
    options: {
      statusCode: number;
      model: string;
      responseBody?: unknown;
      cause?: unknown;
      code?: string;
    }
  ) {
    super(message, { cause: options.cause });
    this.name = "ApiError";
    this.statusCode = options.statusCode;
    this.model = options.model;
    this.responseBody = options.responseBody;
    this.code = options.code;
  }
}

export class NoSpeechGeneratedError extends SpeechSDKError {
  constructor(message?: string) {
    super(message ?? "No speech audio was generated.");
    this.name = "NoSpeechGeneratedError";
  }
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

/**
 * Thrown by `resolveApiKey` when neither the `apiKey` option nor the provider's
 * env var is set. Carries the provider name + env var so callers can build
 * their own actionable error (see `TimestampKeyMissingError`).
 */
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

/**
 * Thrown when `timestamps: "on"` is requested but the SDK can't obtain word
 * timestamps because the required API key for the fallback STT provider is
 * missing. Message names the env vars that would unblock the request.
 */
export class TimestampKeyMissingError extends SpeechSDKError {
  constructor(options: {
    ttsModel: string;
    sttProvider: string;
    envVar: string;
  }) {
    super(
      `${options.ttsModel} does not return word timestamps natively. ` +
        `Set ${options.envVar} to enable the ${options.sttProvider} fallback, ` +
        `pass a configured timestampProvider, or use timestamps: 'auto' | 'off'.`
    );
    this.name = "TimestampKeyMissingError";
  }
}

/**
 * Thrown by the native-dialogue conversation path when the SDK cannot
 * reliably attribute the provider's flat word timestamps back to the input
 * `turns[]`. Happens when the TTS provider inserts, drops, or substantially
 * reorders words such that text-matching against the input transcript fails.
 *
 * The error names the turn index where matching diverged, plus the expected
 * vs. observed word, so callers can decide whether to retry, downgrade to
 * `timestamps: "off"`, or switch to the stitch path (different model per
 * turn) where attribution is exact by construction.
 */
export class ConversationTimestampAttributionError extends SpeechSDKError {
  readonly turnIndex: number;
  readonly observed: string;
  readonly expected: string;

  constructor(args: {
    turnIndex: number;
    observed: string;
    expected: string;
    modelId: string;
  }) {
    super(
      `Failed to attribute timestamps to conversation turns at turn ${args.turnIndex} (${args.modelId}). ` +
        `Expected next word "${args.expected}" but got "${args.observed}". ` +
        "The TTS provider may have inserted, dropped, or reordered words. " +
        'Pass timestamps: "off" to disable attribution, or use the stitch path (different model per turn) for guaranteed attribution.'
    );
    this.name = "ConversationTimestampAttributionError";
    this.turnIndex = args.turnIndex;
    this.observed = args.observed;
    this.expected = args.expected;
  }
}

export class GatewayTimestampsUnavailableError extends SpeechSDKError {
  constructor(model: string) {
    super(
      `${model} was routed through Speech Gateway with timestamps: 'on', but the gateway response did not include word timestamps. The SDK will not run a client-side STT fallback for gateway requests.`
    );
    this.name = "GatewayTimestampsUnavailableError";
  }
}
