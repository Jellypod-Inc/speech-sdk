import { describe, it, expect } from 'vitest';
import {
  generateSpeech,
  SpeechSDKError,
  ApiError,
  NoSpeechGeneratedError,
} from '../index.js';

describe('public exports', () => {
  it('exports generateSpeech', () => {
    expect(typeof generateSpeech).toBe('function');
  });

  it('exports error classes', () => {
    expect(typeof SpeechSDKError).toBe('function');
    expect(typeof ApiError).toBe('function');
    expect(typeof NoSpeechGeneratedError).toBe('function');
  });
});
