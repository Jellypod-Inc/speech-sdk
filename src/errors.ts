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
