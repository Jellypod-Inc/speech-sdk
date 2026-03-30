const speechSDKErrorMarker = 'speech-sdk.error';
const speechSDKErrorSymbol = Symbol.for(speechSDKErrorMarker);

const apiErrorMarker = 'speech-sdk.error.api';
const apiErrorSymbol = Symbol.for(apiErrorMarker);

const noSpeechMarker = 'speech-sdk.error.no-speech';
const noSpeechSymbol = Symbol.for(noSpeechMarker);

export class SpeechSDKError extends Error {
  private readonly [speechSDKErrorSymbol] = true;
  readonly cause?: unknown;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'SpeechSDKError';
    this.cause = options?.cause;
  }

  static isInstance(error: unknown): error is SpeechSDKError {
    return (
      error != null &&
      typeof error === 'object' &&
      Symbol.for(speechSDKErrorMarker) in error &&
      (error as Record<symbol, unknown>)[Symbol.for(speechSDKErrorMarker)] === true
    );
  }
}

export class ApiError extends SpeechSDKError {
  private readonly [apiErrorSymbol] = true;
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
    },
  ) {
    super(message, { cause: options.cause });
    this.name = 'ApiError';
    this.statusCode = options.statusCode;
    this.model = options.model;
    this.responseBody = options.responseBody;
  }

  static isInstance(error: unknown): error is ApiError {
    return (
      error != null &&
      typeof error === 'object' &&
      Symbol.for(apiErrorMarker) in error &&
      (error as Record<symbol, unknown>)[Symbol.for(apiErrorMarker)] === true
    );
  }
}

export class NoSpeechGeneratedError extends SpeechSDKError {
  private readonly [noSpeechSymbol] = true;

  constructor() {
    super('No speech audio was generated.');
    this.name = 'NoSpeechGeneratedError';
  }

  static isInstance(error: unknown): error is NoSpeechGeneratedError {
    return (
      error != null &&
      typeof error === 'object' &&
      Symbol.for(noSpeechMarker) in error &&
      (error as Record<symbol, unknown>)[Symbol.for(noSpeechMarker)] === true
    );
  }
}
