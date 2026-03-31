const speechSDKErrorSymbol = Symbol.for('speech-sdk.error');
const apiErrorSymbol = Symbol.for('speech-sdk.error.api');
const noSpeechSymbol = Symbol.for('speech-sdk.error.no-speech');

function hasMarker(error: unknown, sym: symbol): boolean {
  return (
    error != null &&
    typeof error === 'object' &&
    sym in error &&
    (error as Record<symbol, unknown>)[sym] === true
  );
}

export class SpeechSDKError extends Error {
  private readonly [speechSDKErrorSymbol] = true;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SpeechSDKError';
  }

  static isInstance(error: unknown): error is SpeechSDKError {
    return hasMarker(error, speechSDKErrorSymbol);
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
    return hasMarker(error, apiErrorSymbol);
  }
}

export class NoSpeechGeneratedError extends SpeechSDKError {
  private readonly [noSpeechSymbol] = true;

  constructor() {
    super('No speech audio was generated.');
    this.name = 'NoSpeechGeneratedError';
  }

  static isInstance(error: unknown): error is NoSpeechGeneratedError {
    return hasMarker(error, noSpeechSymbol);
  }
}
