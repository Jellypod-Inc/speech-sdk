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
  // RFC 7807 `code` extension; only Speech Gateway populates it today.
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
        `Set ${options.envVar} to enable the ${options.sttProvider} fallback, ` +
        `pass a configured timestampFallback, or use timestamps: 'off'.`
    );
    this.name = "TimestampKeyMissingError";
  }
}

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
        "Pass timestamps: false to disable attribution, or use the stitch path (different model per turn) for guaranteed attribution."
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

export class TimestampFallbackNotConfiguredError extends SpeechSDKError {
  readonly ttsModel: string;

  constructor(options: { ttsModel: string }) {
    super(
      `${options.ttsModel} does not return word timestamps natively, and no fallback STT is configured. ` +
        "Pass `fallbackSTT` to the provider factory (e.g. createOpenAI({ apiKey, fallbackSTT: { provider: createOpenAISTT(), modelId: 'gpt-4o-transcribe' } })) " +
        "or pass `timestampFallback` per call, or use timestamps: 'off'."
    );
    this.name = "TimestampFallbackNotConfiguredError";
    this.ttsModel = options.ttsModel;
  }
}
