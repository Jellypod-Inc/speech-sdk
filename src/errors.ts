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

  constructor(
    message: string,
    options: {
      statusCode: number;
      responseBody?: unknown;
      cause?: unknown;
      code?: string;
    }
  ) {
    super(message, { cause: options.cause });
    this.name = "ApiError";
    this.statusCode = options.statusCode;
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

export class OutputConversionUnsupportedError extends SpeechSDKError {
  constructor(model: string) {
    super(
      `Explicit output format is not supported by ${model}: the provider doesn't expose a decodable PCM/WAV output mode.`
    );
    this.name = "OutputConversionUnsupportedError";
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
