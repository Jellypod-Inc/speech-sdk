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

  constructor(
    message: string,
    options: {
      statusCode: number;
      model: string;
      responseBody?: unknown;
      cause?: unknown;
    }
  ) {
    super(message, { cause: options.cause });
    this.name = "ApiError";
    this.statusCode = options.statusCode;
    this.model = options.model;
    this.responseBody = options.responseBody;
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
        `Set ${options.envVar} (or pass timestampApiKey) to enable ` +
        `${options.sttProvider} fallback, or use timestamps: 'auto' | 'off'.`
    );
    this.name = "TimestampKeyMissingError";
  }
}
