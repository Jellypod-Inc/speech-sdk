import { describe, it, expect } from 'vitest';
import { SpeechSDKError, ApiError, NoSpeechGeneratedError } from '../errors.js';

describe('SpeechSDKError', () => {
  it('creates an error with message', () => {
    const error = new SpeechSDKError('something failed');
    expect(error.message).toBe('something failed');
    expect(error.name).toBe('SpeechSDKError');
    expect(error).toBeInstanceOf(Error);
  });

  it('creates an error with cause', () => {
    const cause = new Error('root cause');
    const error = new SpeechSDKError('wrapper', { cause });
    expect(error.cause).toBe(cause);
  });

  it('isInstance returns true for SpeechSDKError', () => {
    const error = new SpeechSDKError('test');
    expect(SpeechSDKError.isInstance(error)).toBe(true);
  });

  it('isInstance returns false for plain Error', () => {
    const error = new Error('test');
    expect(SpeechSDKError.isInstance(error)).toBe(false);
  });

  it('isInstance returns false for non-errors', () => {
    expect(SpeechSDKError.isInstance(null)).toBe(false);
    expect(SpeechSDKError.isInstance(undefined)).toBe(false);
    expect(SpeechSDKError.isInstance('string')).toBe(false);
  });
});

describe('ApiError', () => {
  it('creates an error with status code and model', () => {
    const error = new ApiError('request failed', {
      statusCode: 401,
      model: 'openai/gpt-4o-mini-tts',
    });
    expect(error.statusCode).toBe(401);
    expect(error.model).toBe('openai/gpt-4o-mini-tts');
    expect(error.name).toBe('ApiError');
  });

  it('creates an error with response body', () => {
    const error = new ApiError('request failed', {
      statusCode: 500,
      model: 'openai/tts-1',
      responseBody: { error: 'internal' },
    });
    expect(error.responseBody).toEqual({ error: 'internal' });
  });

  it('isInstance returns true for ApiError', () => {
    const error = new ApiError('test', { statusCode: 500, model: 'openai/tts-1' });
    expect(ApiError.isInstance(error)).toBe(true);
  });

  it('isInstance returns true when checked as SpeechSDKError', () => {
    const error = new ApiError('test', { statusCode: 500, model: 'openai/tts-1' });
    expect(SpeechSDKError.isInstance(error)).toBe(true);
  });

  it('isInstance returns false for plain SpeechSDKError', () => {
    const error = new SpeechSDKError('test');
    expect(ApiError.isInstance(error)).toBe(false);
  });
});

describe('NoSpeechGeneratedError', () => {
  it('creates an error with default message', () => {
    const error = new NoSpeechGeneratedError();
    expect(error.message).toBe('No speech audio was generated.');
    expect(error.name).toBe('NoSpeechGeneratedError');
  });

  it('isInstance identifies correctly', () => {
    const error = new NoSpeechGeneratedError();
    expect(NoSpeechGeneratedError.isInstance(error)).toBe(true);
    expect(SpeechSDKError.isInstance(error)).toBe(true);
    expect(ApiError.isInstance(error)).toBe(false);
  });
});
